import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import re
import json
from datetime import datetime
from deleted_invoice_guard import compute_content_hash, should_skip_deleted_invoice

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")  # Changed to email_invoices
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
LOG_PATH = os.path.join(BASE_DIR, "log.txt")
EMAIL_TRACKING_DB = os.path.join(BASE_DIR, "email_tracking.json")  # NEW: Track all emails

os.makedirs(SAVE_DIR, exist_ok=True)

def log(msg):
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def load_email_tracking():
    """Load email tracking database"""
    if os.path.exists(EMAIL_TRACKING_DB):
        try:
            with open(EMAIL_TRACKING_DB, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_email_tracking(tracking):
    """Save email tracking database"""
    with open(EMAIL_TRACKING_DB, 'w') as f:
        json.dump(tracking, f, indent=2)

def track_email(message_id, status, details=None):
    """Track email processing status"""
    tracking = load_email_tracking()
    tracking[message_id] = {
        "timestamp": datetime.now().isoformat(),
        "status": status,
        "details": details or {}
    }
    save_email_tracking(tracking)

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

def run_vendor_router(filepath, detected_vendor=None, message_id=None):
    try:
        cmd = ["python3", VENDOR_ROUTER_PATH, filepath]
        if detected_vendor:
            cmd.append(detected_vendor)
        if message_id:
            cmd.append(message_id)

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

def process_attachments(msg, message_id=None):
    """Process email attachments and return success status"""
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")

    success_count = 0
    failure_count = 0

    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        if part.get('Content-Disposition') is None:
            continue

        filename = part.get_filename()
        if filename and filename.lower().endswith(".pdf"):
            payload = part.get_payload(decode=True)
            if not payload:
                log(f"⚠️ Empty attachment payload for {filename}, skipping")
                failure_count += 1
                continue

            file_hash = compute_content_hash(payload)
            skip_deleted, skip_reason = should_skip_deleted_invoice(
                file_hash=file_hash,
                source_file=filename
            )
            if skip_deleted:
                log(f"⏭️ Skipped attachment {filename} (deleted invoice match: {skip_reason})")
                success_count += 1  # Don't fail on deleted invoices
                continue

            filepath = os.path.join(SAVE_DIR, filename)
            if os.path.exists(filepath):
                log(f"⏩ Skipped duplicate attachment: {filename}")
                success_count += 1  # Don't fail on duplicates
                continue

            try:
                with open(filepath, 'wb') as f:
                    f.write(payload)
                log(f"✅ Saved: {filepath}")

                vendor = run_vendor_router(filepath, detected_vendor, message_id)
                if vendor:
                    log(f"📦 Parsed and routed invoice: {vendor}")
                    success_count += 1
                else:
                    log(f"❌ Failed: unknown or unparseable vendor for {filename}")
                    failure_count += 1
            except Exception as e:
                log(f"❌ Exception processing {filename}: {e}")
                failure_count += 1

    return success_count, failure_count

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

            message_id = msg.get('Message-ID', f'unknown_{uid.decode()}')
            log(f"📧 New email: {subject} (ID: {message_id})")

            # Process attachments and track result
            success_count, failure_count = process_attachments(msg, message_id)

            # Only mark as read if processing was successful
            if failure_count == 0 and success_count > 0:
                move_to_processed(mail, uid)
                track_email(message_id, "processed", {
                    "subject": subject,
                    "success_count": success_count
                })
                log(f"✅ Email marked as processed: {subject}")
            elif failure_count > 0:
                log(f"⚠️ Email has failures ({failure_count}), keeping as UNSEEN for retry: {subject}")
                track_email(message_id, "failed", {
                    "subject": subject,
                    "success_count": success_count,
                    "failure_count": failure_count
                })
            else:
                log(f"⚠️ Email has no attachments, marking as processed: {subject}")
                move_to_processed(mail, uid)
                track_email(message_id, "no_attachments", {"subject": subject})

        mail.logout()
    except Exception as e:
        log(f"❌ Exception in inbox check: {e}")

if __name__ == "__main__":
    log("🚀 Starting autonomous invoice watcher (10s loop)...")
    while True:
        check_inbox()
        time.sleep(10)
