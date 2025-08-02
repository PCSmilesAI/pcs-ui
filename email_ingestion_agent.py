
import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
from dotenv import load_dotenv

# Load credentials
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
# Allowed vendors
ALLOWED_VENDORS = {
    "Exodus Dental Solutions",
    "Patterson Dental",
    "TC Dental Lab",
    "Henry Schein",
    "Artisan Dental"
}

# Paths
SAVE_DIR = os.path.expanduser("~/Desktop/MemorAI_PCS/processed_invoices/")
VENDOR_ROUTER_PATH = os.path.expanduser("~/Desktop/MemorAI_PCS/vendor_router.py")
os.makedirs(SAVE_DIR, exist_ok=True)

def connect_imap():
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def run_vendor_router(filepath):
    try:
        result = subprocess.run(
            ["python3", VENDOR_ROUTER_PATH, filepath],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            vendor_name = result.stdout.strip()
            print(f"🔍 Vendor detected: {vendor_name}")
            return vendor_name
        else:
            print(f"❌ Router error: {result.stderr.strip()}")
    except Exception as e:
        print(f"❌ Exception in router: {e}")
    return None

def process_attachments(msg):
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        if part.get('Content-Disposition') is None:
            continue

        filename = part.get_filename()
        if filename and filename.lower().endswith(".pdf"):
            filepath = os.path.join(SAVE_DIR, filename)
            with open(filepath, 'wb') as f:
                f.write(part.get_payload(decode=True))
            print(f"✅ Saved: {filepath}")

            vendor = run_vendor_router(filepath)
            if vendor in ALLOWED_VENDORS:
                print(f"📦 Accepted invoice from: {vendor}")
            else:
                print(f"⏩ Ignored unknown vendor: {vendor}")
                os.remove(filepath)

def move_to_processed(mail, uid):
    mail.uid('COPY', uid, 'Processed')
    mail.uid('STORE', uid, '+FLAGS', '(\\Deleted)')
    mail.expunge()

def check_inbox():
    print("📥 Checking inbox...")
    mail = connect_imap()
    mail.select("INBOX")
    status, messages = mail.uid('search', None, 'UNSEEN')
    if status != 'OK':
        print("❌ Failed to search.")
        return

    for uid in messages[0].split():
        status, msg_data = mail.uid('fetch', uid, '(RFC822)')
        if status != 'OK':
            continue

        msg = email.message_from_bytes(msg_data[0][1])
        subject = decode_header(msg["Subject"])[0][0]
        print(f"📧 New email: {subject if isinstance(subject, str) else subject.decode()}")

        process_attachments(msg)
        move_to_processed(mail, uid)

    mail.logout()

if __name__ == "__main__":
    while True:
        check_inbox()
        time.sleep(120)  # Check every 2 minutes
