import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import re
from datetime import datetime

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")  # Changed to email_invoices
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
LOG_PATH = os.path.join(BASE_DIR, "log.txt")

os.makedirs(SAVE_DIR, exist_ok=True)

def log(msg):
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def connect_imap():
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def detect_vendor_from_email(msg):
    """Detect vendor from email sender, subject, or body"""
    vendor_keywords = {
        'epic': ['epic', 'epic dental', 'epicdentallab'],
        'patterson': ['patterson', 'patterson dental'],
        'henry': ['henry', 'henry schein'],
        'exodus': ['exodus', 'exodus dental'],
        'artisan': ['artisan', 'artisan dental'],
        'tc': ['tc dental', 'tc dental lab']
    }
    
    # Check sender email
    sender = msg.get('From', '').lower()
    for vendor, keywords in vendor_keywords.items():
        if any(keyword in sender for keyword in keywords):
            return vendor
    
    # Check subject
    subject = msg.get('Subject', '').lower()
    for vendor, keywords in vendor_keywords.items():
        if any(keyword in subject for keyword in keywords):
            return vendor
    
    # Check email body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body += part.get_payload(decode=True).decode('utf-8', errors='ignore').lower()
    else:
        body = msg.get_payload(decode=True).decode('utf-8', errors='ignore').lower()
    
    for vendor, keywords in vendor_keywords.items():
        if any(keyword in body for keyword in keywords):
            return vendor
    
    return None

def run_vendor_router(filepath, detected_vendor=None):
    try:
        cmd = ["python3", VENDOR_ROUTER_PATH, filepath]
        if detected_vendor:
            cmd.append(detected_vendor)
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            vendor_name = result.stdout.strip()
            log(f"🔍 Vendor detected: {vendor_name}")
            return vendor_name
        else:
            log(f"❌ Router error: {result.stderr.strip()}")
    except Exception as e:
        log(f"❌ Exception in router: {e}")
    return None

def process_attachments(msg):
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
    # DON'T delete emails - just copy to Processed folder and mark as read
    mail.uid('COPY', uid, 'Processed')
    mail.uid('STORE', uid, '+FLAGS', '(\\Seen)')  # Mark as read instead of deleted
    # mail.expunge()  # Commented out to prevent deletion

def check_inbox():
    log("📥 Checking inbox...")
    try:
        mail = connect_imap()
        mail.select("INBOX")
        status, messages = mail.uid('search', None, 'UNSEEN')
        if status != 'OK':
            log("❌ Failed to search inbox.")
            return

        for uid in messages[0].split():
            status, msg_data = mail.uid('fetch', uid, '(RFC822)')
            if status != 'OK':
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode(errors='ignore')
            log(f"📧 New email: {subject}")
            process_attachments(msg)
            move_to_processed(mail, uid)

        mail.logout()
    except Exception as e:
        log(f"❌ Exception in inbox check: {e}")

if __name__ == "__main__":
    log("🚀 Starting autonomous invoice watcher (10s loop)...")
    while True:
        check_inbox()
        time.sleep(10)