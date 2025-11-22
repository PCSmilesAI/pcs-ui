#!/usr/bin/env python3
"""
One-Time Full Inbox Scanner
Scans ALL emails (read and unread) in invoices@pcsmilesai.com inbox
and extracts invoices, skipping duplicates that already exist in the database.

This script is designed to be run ONCE to backfill missing invoices.
"""

import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import sqlite3
import hashlib
import json
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Email credentials
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(BASE_DIR, "pcs_ui_data"))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(DATA_DIR)

SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
DB_PATH = os.path.join(DATA_DIR, "pcs.db")

# Create necessary directories
os.makedirs(SAVE_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

def log(msg):
    """Simple logging"""
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}")

def load_existing_invoices():
    """Load existing invoices from database to check for duplicates"""
    message_ids = set()
    invoice_numbers = set()
    tombstones = set()
    invoice_count = 0

    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Get all invoices
            cursor.execute("""
                SELECT invoice_number, source_message_id
                FROM invoices
                WHERE deleted = 0
            """)

            for row in cursor.fetchall():
                invoice_count += 1
                if row['invoice_number']:
                    invoice_numbers.add(row['invoice_number'].lower().strip())
                if row['source_message_id']:
                    message_ids.add(row['source_message_id'])

            # Load tombstones
            cursor.execute("SELECT source_message_id FROM tombstones")
            for row in cursor.fetchall():
                if row[0]:
                    tombstones.add(row[0])

            conn.close()
            log(f"✅ Loaded {invoice_count} existing invoices from database")
            log(f"   - {len(message_ids)} unique message IDs")
            log(f"   - {len(invoice_numbers)} unique invoice numbers")
            log(f"   - {len(tombstones)} tombstones (deleted invoices)")
            return message_ids, invoice_numbers, tombstones

        except Exception as e:
            log(f"❌ Error loading from database: {e}")
            return set(), set(), set()

    log("⚠️ Database not found, starting fresh")
    return set(), set(), set()

def extract_invoice_number_from_subject(subject):
    """Extract potential invoice numbers from email subject"""
    if not subject:
        return None
    
    import re
    patterns = [
        r'invoice\s*#?\s*(\d+)',
        r'inv\s*#?\s*(\d+)',
        r'bill\s*#?\s*(\d+)',
        r'#(\d{4,})',
        r'(\d{4,})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, subject.lower())
        if match:
            return match.group(1)
    
    return None

def is_duplicate(source_message_id, subject, message_ids, invoice_numbers, tombstones):
    """Check if this email/invoice is already in the database"""
    # Check tombstone (deleted invoice)
    if source_message_id and source_message_id in tombstones:
        return True, "tombstone"
    
    # Check message ID (most reliable)
    if source_message_id and source_message_id in message_ids:
        return True, "message_id"
    
    # Check invoice number from subject
    invoice_num = extract_invoice_number_from_subject(subject)
    if invoice_num and invoice_num.lower() in invoice_numbers:
        return True, "invoice_number"
    
    return False, None

def detect_vendor_from_email(msg):
    """Detect vendor from email sender/subject"""
    sender = msg.get("From", "").lower()
    subject = msg.get("Subject", "").lower()
    
    vendor_patterns = {
        'epic': ['epic', 'epic dental'],
        'patterson': ['patterson', 'pattersondental'],
        'henry': ['henry schein', 'henryschein'],
        'exodus': ['exodus', 'exodus dental'],
        'artisan': ['artisan', 'artisan dental'],
        'tc': ['tc dental', 'tc dental supply']
    }
    
    for vendor, patterns in vendor_patterns.items():
        for pattern in patterns:
            if pattern in sender or pattern in subject:
                return vendor
    return None

def extract_and_save_pdfs(msg, email_subject, source_message_id):
    """Extract PDFs from email"""
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"   📧 Vendor detected: {detected_vendor}")

    pdf_files = []
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue

        filename = part.get_filename()
        if not filename:
            content_type = part.get_content_type()
            if content_type.startswith('application/'):
                params = part.get_params()
                if params:
                    for key, value in params:
                        if key.lower() == 'name':
                            filename = value
                            break

        if filename and filename.lower().endswith(".pdf"):
            log(f"   📄 Found PDF: {filename}")
            
            # Create unique filename
            if source_message_id:
                name_without_ext = os.path.splitext(filename)[0]
                unique_filename = f"{name_without_ext}_{hashlib.md5(source_message_id.encode()).hexdigest()[:8]}.pdf"
            else:
                timestamp = int(time.time() * 1000)
                name_without_ext = os.path.splitext(filename)[0]
                unique_filename = f"{name_without_ext}_{timestamp}.pdf"

            filepath = os.path.join(SAVE_DIR, unique_filename)
            
            try:
                with open(filepath, 'wb') as f:
                    f.write(part.get_payload(decode=True))
                pdf_files.append((filepath, detected_vendor))
                log(f"   ✅ Saved: {unique_filename}")
            except Exception as e:
                log(f"   ❌ Failed to save PDF {unique_filename}: {e}")

    return pdf_files

def process_pdf_file(filepath, detected_vendor):
    """Process a single PDF file through vendor router"""
    try:
        if not os.path.exists(filepath):
            log(f"   ❌ PDF file does not exist: {filepath}")
            return False

        cmd = ["python3", VENDOR_ROUTER_PATH, filepath]
        if detected_vendor:
            cmd.append(detected_vendor)

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0 and result.stdout.strip():
            vendor = result.stdout.strip()
            log(f"   ✅ Processed: {vendor}")
            return True
        else:
            log(f"   ⚠️ Failed to process PDF: {os.path.basename(filepath)}")
            return False
    except Exception as e:
        log(f"   ❌ Error processing PDF: {e}")
        return False

def scan_all_emails():
    """Scan ALL emails in inbox (read and unread)"""
    log("=" * 80)
    log("🚀 Starting ONE-TIME FULL INBOX SCAN")
    log("=" * 80)
    
    # Load existing invoices for duplicate detection
    message_ids, invoice_numbers, tombstones = load_existing_invoices()
    
    try:
        # Connect to email
        log(f"📧 Connecting to {IMAP_SERVER}...")
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_USER, EMAIL_PASS)
        mail.select("INBOX")
        log("✅ Connected successfully")
        
        # Get ALL emails (read and unread)
        log("🔍 Searching for ALL emails in inbox...")
        status, messages = mail.uid('search', None, 'ALL')
        
        if status != 'OK':
            log("❌ Failed to search inbox")
            return
        
        email_uids = messages[0].split() if messages[0] else []
        log(f"📬 Found {len(email_uids)} total emails in inbox")
        
        # Statistics
        stats = {
            'total_emails': len(email_uids),
            'processed': 0,
            'duplicates_skipped': 0,
            'no_pdf': 0,
            'pdfs_extracted': 0,
            'pdfs_processed': 0,
            'pdfs_failed': 0,
        }
        
        pdf_tasks = []  # For parallel processing
        
        log("\n" + "=" * 80)
        log("📥 Processing emails...")
        log("=" * 80)
        
        # Process each email
        for idx, uid in enumerate(email_uids, 1):
            try:
                status, msg_data = mail.uid('fetch', uid, '(RFC822)')
                if status != 'OK':
                    continue
                
                msg = email.message_from_bytes(msg_data[0][1])
                source_message_id = msg.get("Message-ID", "")
                
                # Decode subject
                subject_header = decode_header(msg["Subject"])
                subject = subject_header[0][0] if subject_header else ""
                if isinstance(subject, bytes):
                    subject = subject.decode(errors='ignore')
                
                # Check for duplicates
                is_dup, dup_reason = is_duplicate(source_message_id, subject, message_ids, invoice_numbers, tombstones)
                
                if is_dup:
                    stats['duplicates_skipped'] += 1
                    if dup_reason == "tombstone":
                        log(f"[{idx}/{len(email_uids)}] ⚠️ SKIP (deleted): {subject[:60]}")
                    elif dup_reason == "message_id":
                        log(f"[{idx}/{len(email_uids)}] ⚠️ SKIP (duplicate message): {subject[:60]}")
                    elif dup_reason == "invoice_number":
                        log(f"[{idx}/{len(email_uids)}] ⚠️ SKIP (duplicate invoice): {subject[:60]}")
                    continue
                
                # Check if email has PDF attachments
                has_pdf = False
                for part in msg.walk():
                    if part.get_content_maintype() == 'multipart':
                        continue
                    filename = part.get_filename()
                    if not filename:
                        content_type = part.get_content_type()
                        if content_type.startswith('application/'):
                            params = part.get_params()
                            if params:
                                for key, value in params:
                                    if key.lower() == 'name':
                                        filename = value
                                        break
                    if filename and filename.lower().endswith(".pdf"):
                        has_pdf = True
                        break
                
                if not has_pdf:
                    stats['no_pdf'] += 1
                    log(f"[{idx}/{len(email_uids)}] ⚠️ NO PDF: {subject[:60]}")
                    continue
                
                # Extract PDFs
                log(f"[{idx}/{len(email_uids)}] ✅ PROCESSING: {subject[:60]}")
                pdf_files = extract_and_save_pdfs(msg, subject, source_message_id)
                
                if pdf_files:
                    stats['pdfs_extracted'] += len(pdf_files)
                    stats['processed'] += 1
                    # Queue PDFs for parallel processing
                    for filepath, detected_vendor in pdf_files:
                        pdf_tasks.append((filepath, detected_vendor))
                else:
                    stats['no_pdf'] += 1
                    log(f"   ⚠️ No PDFs extracted from email")
                
            except Exception as e:
                log(f"[{idx}/{len(email_uids)}] ❌ ERROR processing email: {e}")
                continue
        
        mail.logout()
        
        # Process PDFs in parallel
        if pdf_tasks:
            log("\n" + "=" * 80)
            log(f"🔄 Processing {len(pdf_tasks)} PDFs in parallel...")
            log("=" * 80)
            
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(process_pdf_file, filepath, vendor) for filepath, vendor in pdf_tasks]
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        if result:
                            stats['pdfs_processed'] += 1
                        else:
                            stats['pdfs_failed'] += 1
                    except Exception as e:
                        stats['pdfs_failed'] += 1
                        log(f"   ❌ PDF processing error: {e}")
        
        # Final summary
        log("\n" + "=" * 80)
        log("📊 SCAN SUMMARY")
        log("=" * 80)
        log(f"Total emails scanned: {stats['total_emails']}")
        log(f"✅ Processed (had PDFs): {stats['processed']}")
        log(f"⚠️ Duplicates skipped: {stats['duplicates_skipped']}")
        log(f"📄 No PDF attachments: {stats['no_pdf']}")
        log(f"📥 PDFs extracted: {stats['pdfs_extracted']}")
        log(f"✅ PDFs processed successfully: {stats['pdfs_processed']}")
        log(f"❌ PDFs failed to process: {stats['pdfs_failed']}")
        log("=" * 80)
        
        # Estimate new invoices added
        new_invoices = stats['pdfs_processed']
        log(f"\n🎉 Estimated new invoices added: {new_invoices}")
        log(f"💡 Check your dashboard to see the updated invoice count!")
        
    except Exception as e:
        log(f"❌ Fatal error: {e}")
        import traceback
        log(traceback.format_exc())

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("⚠️  ONE-TIME FULL INBOX SCANNER")
    print("=" * 80)
    print("This script will:")
    print("  1. Scan ALL emails (read and unread) in invoices@pcsmilesai.com")
    print("  2. Extract PDF invoices from emails")
    print("  3. Skip duplicates that already exist in the database")
    print("  4. Process new invoices through the vendor router")
    print("\nPress Ctrl+C to cancel, or wait 5 seconds to continue...")
    print("=" * 80 + "\n")
    
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print("\n❌ Cancelled by user")
        exit(0)
    
    scan_all_emails()

