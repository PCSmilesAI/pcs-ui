import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import re
import json
from datetime import datetime
from deduplicate_invoices import deduplicate_invoices

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
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
        
        # Check if vendor and amount match (fuzzy matching)
        if invoice.get('vendor_name') and invoice.get('amount'):
            # This would need more sophisticated matching
            pass
    
    return False

def connect_imap():
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def detect_vendor_from_email(msg):
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

def run_vendor_router(filepath, detected_vendor=None):
    try:
        cmd = ["python3", VENDOR_ROUTER_PATH, filepath]
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

def process_attachments(msg, email_subject):
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")
    
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
            with open(filepath, 'wb') as f:
                f.write(part.get_payload(decode=True))
            log(f"✅ Saved: {filepath}")

            vendor = run_vendor_router(filepath, detected_vendor)
            if vendor:
                log(f"📦 Parsed and routed invoice: {vendor}")
            else:
                log("⏩ Ignored: unknown or unparseable vendor")

def move_to_processed(mail, uid):
    # Mark as read instead of deleted
    mail.uid('store', uid, '+FLAGS', '\\Seen')

def check_inbox():
    log("📥 Checking inbox for new invoices...")
    try:
        # Load existing invoices for cross-reference
        existing_invoices = load_existing_invoices()
        log(f"📊 Loaded {len(existing_invoices)} existing invoices from PCS AI")
        
        mail = connect_imap()
        mail.select("INBOX")
        
        # Get ALL emails, not just unseen
        status, messages = mail.uid('search', None, 'ALL')
        if status != 'OK':
            log("❌ Failed to search inbox.")
            return

        email_uids = messages[0].split() if messages[0] else []
        log(f"📧 Found {len(email_uids)} emails in inbox")
        
        processed_count = 0
        skipped_count = 0
        
        for uid in email_uids:
            status, msg_data = mail.uid('fetch', uid, '(RFC822)')
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
            
            if has_pdf:
                log(f"📧 Processing new invoice email: {subject}")
                process_attachments(msg, subject)
                move_to_processed(mail, uid)
                processed_count += 1
            else:
                log(f"⏩ Skipped email (no PDF): {subject}")
                skipped_count += 1

        log(f"✅ Processed {processed_count} new invoices, skipped {skipped_count} existing")
        mail.logout()
        
    except Exception as e:
        log(f"❌ Exception in inbox check: {e}")
    finally:
        # Always run deduplication after each check to keep queue clean
        try:
            log("🧹 Running invoice queue deduplication...")
            deduplicate_invoices()
        except Exception as de:
            log(f"❌ Deduplication error: {de}")

if __name__ == "__main__":
    log("🚀 Starting enhanced invoice watcher (10s loop)...")
    while True:
        check_inbox()
        time.sleep(10)  # Check every 10 seconds
