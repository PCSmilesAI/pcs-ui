import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import re
import json
from datetime import datetime

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "enhanced_vendor_router.py")
LOG_PATH = os.path.join(BASE_DIR, "log.txt")
INVOICE_QUEUE_PATH = os.path.join(BASE_DIR, "pcs_ai_data", "invoice_queue.json")

os.makedirs(SAVE_DIR, exist_ok=True)

def log(msg):
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

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
        r'#(\d+)',
        r'(\d{4,})',  # 4+ digit numbers
    ]
    
    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            return match.group(1)
    return None

def detect_vendor_from_email(msg):
    """Detect vendor from email content"""
    subject = msg.get('Subject', '')
    from_addr = msg.get('From', '')
    
    # Convert to lowercase for matching
    subject_lower = subject.lower()
    from_lower = from_addr.lower()
    
    # Vendor patterns
    vendors = {
        'henry': ['henry schein', 'henryschein'],
        'patterson': ['patterson dental', 'patterson'],
        'darby': ['darby'],
        'artisan': ['artisan'],
    }
    
    for vendor, patterns in vendors.items():
        for pattern in patterns:
            if pattern in subject_lower or pattern in from_lower:
                return vendor
    return None

def is_meaningful_invoice_data(data):
    """Check if the parsed invoice data has meaningful information"""
    if not data:
        return False
    
    # Check if we have at least one meaningful field
    meaningful_fields = [
        'invoice_number', 'invoice_total', 'invoice_date', 
        'office_location', 'line_items'
    ]
    
    for field in meaningful_fields:
        if field in data and data[field]:
            if field == 'line_items' and isinstance(data[field], list) and len(data[field]) > 0:
                return True
            elif field != 'line_items' and str(data[field]).strip():
                return True
    
    return False

def run_vendor_router(pdf_path, email_subject):
    """Run the vendor router on the PDF and check if it extracted meaningful data"""
    try:
        result = subprocess.run([
            'python3', VENDOR_ROUTER_PATH, pdf_path, email_subject
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            vendor = result.stdout.strip()
            log(f"📋 Vendor detected: {vendor}")
            
            # Handle multi-page invoices
            if vendor == "tc_multipage":
                log(f"🔄 Multi-page TC Dental PDF processed - checking for multiple invoices")
                # Check for multiple JSON files created by multi-page processor
                json_files = [f for f in os.listdir(OUTPUT_DIR) if f.endswith('.json') and 'invoice_' in f]
                if json_files:
                    meaningful_count = 0
                    for json_file in json_files:
                        json_path = os.path.join(OUTPUT_DIR, json_file)
                        with open(json_path, 'r') as f:
                            data = json.load(f)
                        if is_meaningful_invoice_data(data):
                            meaningful_count += 1
                    
                    log(f"✅ Multi-page processing: {meaningful_count} meaningful invoices extracted")
                    return meaningful_count > 0
                else:
                    log(f"⚠️ No invoice JSON files created by multi-page processor")
                    return False
            
            # Check if the vendor router created a meaningful output file
            output_file = os.path.join(BASE_DIR, "output_jsons", os.path.splitext(os.path.basename(pdf_path))[0] + ".json")
            
            if os.path.exists(output_file):
                try:
                    with open(output_file, 'r') as f:
                        data = json.load(f)
                    
                    if is_meaningful_invoice_data(data):
                        log(f"✅ Vendor router success with meaningful data: {pdf_path}")
                        return True
                    else:
                        log(f"⚠️ Vendor router created empty/meaningless data: {pdf_path}")
                        # Remove the empty file
                        os.remove(output_file)
                        return False
                except Exception as e:
                    log(f"❌ Error reading vendor router output: {e}")
                    return False
            else:
                log(f"❌ Vendor router did not create output file: {pdf_path}")
                return False
        else:
            log(f"❌ Vendor router failed: {result.stderr}")
            return False
    except Exception as e:
        log(f"❌ Vendor router error: {e}")
        return None

def process_attachments(msg, email_subject):
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")
    
    for part in msg.walk():
        if part.get('Content-Disposition') is None:
            continue

        filename = part.get_filename()
        if filename and filename.lower().endswith(".pdf"):
            filepath = os.path.join(SAVE_DIR, filename)
            if os.path.exists(filepath):
                log(f"⏩ Skipped duplicate attachment: {filename}")
                continue
            with open(filepath, 'wb') as f:
                f.write(part.get_payload(decode=True))
            log(f"📎 Saved PDF: {filename}")
            
            # Run vendor router on the PDF and only proceed if it extracted meaningful data
            if run_vendor_router(filepath, email_subject):
                log(f"✅ Successfully processed invoice: {filename}")
            else:
                log(f"⚠️ Skipped invoice with no meaningful data: {filename}")

def move_to_processed(mail, uid):
    """Mark email as processed (seen)"""
    try:
        mail.uid('store', uid, '+FLAGS', '\\Seen')
        # Don't expunge to keep emails in inbox
    except Exception as e:
        log(f"❌ Error marking email as processed: {e}")

def check_inbox():
    """Check inbox for new invoices - ONE TIME ONLY"""
    try:
        log("📥 Checking inbox for new invoices...")
        
        # Load existing invoices to avoid duplicates
        existing_invoices = load_existing_invoices()
        existing_invoice_numbers = set()
        for inv in existing_invoices:
            if inv.get('invoice_number'):
                existing_invoice_numbers.add(str(inv['invoice_number']))
        
        log(f"📊 Loaded {len(existing_invoices)} existing invoices from PCS AI")
        
        # Connect to email
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_USER, EMAIL_PASS)
        mail.select('inbox')
        
        # Search for all emails
        status, messages = mail.search(None, 'ALL')
        if status != 'OK':
            log("❌ Failed to search emails")
            return
        
        email_ids = messages[0].split()
        log(f"📧 Found {len(email_ids)} emails in inbox")
        
        processed_count = 0
        skipped_count = 0
        
        for uid in email_ids:
            try:
                status, msg_data = mail.uid('fetch', uid, '(RFC822)')
                if status != 'OK':
                    continue
                
                msg = email.message_from_bytes(msg_data[0][1])
                subject = decode_header(msg.get('Subject', ''))[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode('utf-8', errors='ignore')
                
                # Skip non-invoice emails
                if not any(keyword in subject.lower() for keyword in ['invoice', 'receipt', 'statement', 'bill']):
                    log(f"⏩ Skipped email (no invoice keywords): {subject}")
                    skipped_count += 1
                    continue
                
                # Check if this invoice already exists
                invoice_number = extract_invoice_number_from_subject(subject)
                if invoice_number and invoice_number in existing_invoice_numbers:
                    log(f"✅ Invoice {invoice_number} already exists in PCS AI")
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
                
                if has_pdf:
                    log(f"📧 Processing new invoice email: {subject}")
                    process_attachments(msg, subject)
                    move_to_processed(mail, uid)
                    processed_count += 1
                else:
                    log(f"⏩ Skipped email (no PDF): {subject}")
                    skipped_count += 1
                    
            except Exception as e:
                log(f"❌ Error processing email {uid}: {e}")
                continue
        
        log(f"✅ Processed {processed_count} new invoices, skipped {skipped_count} existing")
        
        # Close connection
        mail.close()
        mail.logout()
        
    except Exception as e:
        log(f"❌ Exception in inbox check: {e}")

if __name__ == "__main__":
    log("🚀 Starting FIXED email processing...")
    check_inbox()
    log("✅ Email processing complete!")
