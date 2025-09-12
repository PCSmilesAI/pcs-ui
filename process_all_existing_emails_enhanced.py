#!/usr/bin/env python3
"""
Enhanced Process All Existing Emails Script
Processes all emails in the inbox and cross-references with existing PCS AI invoices
to avoid duplicates and process only new invoices.
"""

import os
import sys
import imaplib
import email
import time
from email.header import decode_header
import subprocess
import json
from datetime import datetime
import re

# Configuration
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
IMAP_PORT = 993
SAVE_DIR = "email_invoices"
INVOICE_QUEUE_PATH = os.path.join("pcs_ai_data", "invoice_queue.json")

def log(msg):
    """Custom logging function"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def create_directories():
    """Create necessary directories if they don't exist"""
    directories = [SAVE_DIR, "pcs_ai_data", "output_jsons"]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            log(f"📁 Created directory: {directory}")

def load_existing_invoices():
    """Load existing invoices from PCS AI system"""
    if not os.path.exists(INVOICE_QUEUE_PATH):
        return []
    
    try:
        with open(INVOICE_QUEUE_PATH, 'r') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        log(f"❌ Error loading existing invoices: {e}")
        return []

def extract_invoice_number_from_subject(subject):
    """Extract potential invoice numbers from email subject"""
    if not subject:
        return None
    
    # Common patterns for invoice numbers
    patterns = [
        r'invoice\s*#?\s*(\d+)',
        r'inv\s*#?\s*(\d+)',
        r'bill\s*#?\s*(\d+)',
        r'#(\d{4,})',  # 4+ digit numbers
        r'(\d{4,})',   # 4+ digit numbers anywhere
    ]
    
    for pattern in patterns:
        match = re.search(pattern, subject.lower())
        if match:
            return match.group(1)
    
    return None

def is_invoice_already_processed(email_subject, existing_invoices):
    """Check if this invoice is already in the PCS AI system"""
    if not email_subject:
        return False
    
    # Extract potential invoice number from subject
    subject_invoice_num = extract_invoice_number_from_subject(email_subject)
    
    for invoice in existing_invoices:
        # Check if invoice number matches
        if subject_invoice_num and invoice.get('invoice_number') == subject_invoice_num:
            log(f"✅ Invoice {subject_invoice_num} already exists in PCS AI")
            return True
        
        # Check if subject contains invoice number
        if invoice.get('invoice_number') and invoice['invoice_number'] in email_subject:
            log(f"✅ Invoice {invoice['invoice_number']} already exists in PCS AI")
            return True
    
    return False

def detect_vendor_from_email(msg):
    """Detect vendor from email content"""
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

def get_parser_file(vendor):
    """Get the parser file for a vendor"""
    parser_files = {
        'epic': 'epic_parser.py',
        'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
        'henry': 'henry_parser.py',
        'exodus': 'exodus_parser.py',
        'artisan': 'parse_artisan_dental_exporting_fixed.py',
        'tc': 'parse_tc_dental_invoice.py'
    }
    return parser_files.get(vendor)

def run_vendor_router(filepath, detected_vendor=None):
    """Run the vendor router to parse the PDF"""
    try:
        cmd = ["python3", "vendor_router.py", filepath]
        if detected_vendor:
            cmd.append(detected_vendor)
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            log(f"❌ Vendor router failed: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        log(f"⏰ Vendor router timeout for {filepath}")
        return None
    except Exception as e:
        log(f"❌ Vendor router error: {e}")
        return None

def process_email_invoices():
    """Process all emails in the inbox"""
    log("🚀 Starting enhanced email processing...")
    
    # Load existing invoices for cross-reference
    existing_invoices = load_existing_invoices()
    log(f"📊 Loaded {len(existing_invoices)} existing invoices from PCS AI")
    
    try:
        # Connect to email server
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_USER, EMAIL_PASS)
        mail.select("INBOX")
        
        # Get all emails
        status, messages = mail.search(None, 'ALL')
        if status != 'OK':
            log("❌ Failed to search inbox")
            return False
        
        email_ids = messages[0].split()
        log(f"📧 Found {len(email_ids)} emails in inbox")
        
        processed_count = 0
        skipped_count = 0
        error_count = 0
        
        for email_id in email_ids:
            try:
                # Fetch email
                status, msg_data = mail.fetch(email_id, '(RFC822)')
                if status != 'OK':
                    continue
                
                msg = email.message_from_bytes(msg_data[0][1])
                subject = decode_header(msg["Subject"])[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode(errors='ignore')
                
                # Check if this invoice is already processed
                if is_invoice_already_processed(subject, existing_invoices):
                    skipped_count += 1
                    continue
                
                # Check if email has PDF attachments
                has_pdf = False
                for part in msg.walk():
                    if part.get('Content-Disposition') is not None:
                        filename = part.get_filename()
                        if filename and filename.lower().endswith(".pdf"):
                            has_pdf = True
                            break
                
                if not has_pdf:
                    log(f"⏩ Skipped email (no PDF): {subject}")
                    skipped_count += 1
                    continue
                
                log(f"📧 Processing email: {subject}")
                
                # Detect vendor
                detected_vendor = detect_vendor_from_email(msg)
                if detected_vendor:
                    log(f"🔍 Detected vendor: {detected_vendor}")
                
                # Process attachments
                for part in msg.walk():
                    if part.get_content_maintype() == 'multipart':
                        continue
                    if part.get('Content-Disposition') is None:
                        continue

                    filename = part.get_filename()
                    if filename and filename.lower().endswith(".pdf"):
                        filepath = os.path.join(SAVE_DIR, filename)
                        if os.path.exists(filepath):
                            log(f"⏩ Skipped duplicate attachment: {filename}")
                            continue
                        
                        # Save PDF
                        with open(filepath, 'wb') as f:
                            f.write(part.get_payload(decode=True))
                        log(f"✅ Saved: {filepath}")

                        # Run vendor router
                        vendor = run_vendor_router(filepath, detected_vendor)
                        if vendor:
                            log(f"📦 Parsed and routed invoice: {vendor}")
                            processed_count += 1
                        else:
                            log("⏩ Ignored: unknown or unparseable vendor")
                            error_count += 1
                
            except Exception as e:
                log(f"❌ Error processing email {email_id}: {e}")
                error_count += 1
                continue
        
        log(f"✅ Processing complete!")
        log(f"📊 Processed: {processed_count} new invoices")
        log(f"⏩ Skipped: {skipped_count} existing invoices")
        log(f"❌ Errors: {error_count} failed")
        
        mail.logout()
        return True
        
    except Exception as e:
        log(f"❌ Exception in email processing: {e}")
        return False

def main():
    """Main function"""
    log("🚀 Enhanced Email Invoice Processor")
    create_directories()
    
    if process_email_invoices():
        log("✅ Email processing completed successfully")
    else:
        log("❌ Email processing failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
