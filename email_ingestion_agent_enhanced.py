import imaplib
import email
from email.header import decode_header
import os
import time
import subprocess
import re
import json
import signal
import random
import sqlite3
import hashlib
from datetime import datetime
from deduplicate_invoices import deduplicate_invoices

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(BASE_DIR, "pcs_ui_data"))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(DATA_DIR)

SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
LOG_PATH = os.path.join(BASE_DIR, "log.txt")
INVOICE_QUEUE_PATH = os.path.join(BASE_DIR, "pcs_ai_data", "invoice_queue.json")

# Runtime configuration
LOCKS_DIR = os.path.join(DATA_DIR, "locks")
INGEST_DB_PATH = os.path.join(DATA_DIR, "ingest.db")
SCAN_LOCK_PATH = os.path.join(LOCKS_DIR, "inbox.scan.lock")
DELETED_INVOICES_PATH = os.path.join(DATA_DIR, "deleted_invoices.json")

# Create necessary directories
os.makedirs(SAVE_DIR, exist_ok=True)
os.makedirs(LOCKS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Global configuration (can be reloaded via SIGHUP)
_config = {
    "interval_ms": int(os.environ.get("INBOX_SCAN_INTERVAL_MS", "60000")),  # Default 60s
    "backoff_seconds": 10,  # Start at 10s
    "max_backoff_seconds": 300,  # Cap at 5 minutes
}

# Global state
_last_scan_result = {
    "timestamp": None,
    "added": 0,
    "skipped": 0,
    "duration_ms": 0,
    "error": None,
}

def reload_config():
    """Reload configuration from environment variables (called on SIGHUP)"""
    global _config
    new_interval = int(os.environ.get("INBOX_SCAN_INTERVAL_MS", "60000"))
    if new_interval != _config["interval_ms"]:
        log(f"[INBOX][CONFIG][RELOAD] Interval changed: {_config['interval_ms']}ms → {new_interval}ms")
        _config["interval_ms"] = new_interval
    else:
        log(f"[INBOX][CONFIG][RELOAD] Interval unchanged: {new_interval}ms")

def handle_sighup(signum, frame):
    """Handle SIGHUP signal to reload configuration"""
    reload_config()

# Register SIGHUP handler
signal.signal(signal.SIGHUP, handle_sighup)

def log(msg):
    """Structured logging with predictable format"""
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def init_ingest_db():
    """Initialize SQLite database for tracking seen messages"""
    conn = sqlite3.connect(INGEST_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS seen_messages (
            message_key TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            first_seen_ts TEXT NOT NULL,
            last_seen_ts TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    log("[INBOX][DB][INIT] Initialized ingest.db")

def compute_message_key(msg, uid):
    """Compute stable message key for IMAP messages"""
    # For IMAP, use composite hash of UID + Message-ID + Date + From + Subject
    message_id = msg.get("Message-ID", "")
    date = msg.get("Date", "")
    from_addr = msg.get("From", "")
    subject = msg.get("Subject", "")

    # Create composite key
    composite = f"{uid}|{message_id}|{date}|{from_addr}|{subject}"
    return hashlib.md5(composite.encode()).hexdigest()

def is_message_seen(message_key):
    """Check if message has been seen before"""
    conn = sqlite3.connect(INGEST_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM seen_messages WHERE message_key = ?", (message_key,))
    result = cursor.fetchone()
    conn.close()
    return result is not None

def mark_message_seen(message_key):
    """Mark message as seen in the database"""
    conn = sqlite3.connect(INGEST_DB_PATH)
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO seen_messages (message_key, provider, first_seen_ts, last_seen_ts)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(message_key) DO UPDATE SET last_seen_ts = ?
    """, (message_key, "imap", now, now, now))
    conn.commit()
    conn.close()

def acquire_scan_lock():
    """Acquire global scan lock. Returns True if acquired, False if busy."""
    if os.path.exists(SCAN_LOCK_PATH):
        # Check if lock is stale (>10 minutes old)
        lock_age = time.time() - os.path.getmtime(SCAN_LOCK_PATH)
        if lock_age > 600:  # 10 minutes
            log(f"[INBOX][SCAN][LOCK] Stale lock detected ({lock_age:.0f}s old), removing")
            try:
                os.remove(SCAN_LOCK_PATH)
            except OSError:
                pass
        else:
            log(f"[INBOX][SCAN][BUSY] Another scan is in progress (lock age: {lock_age:.0f}s)")
            return False

    # Create lock file
    try:
        with open(SCAN_LOCK_PATH, "w") as f:
            f.write(f"{os.getpid()}\n{datetime.now().isoformat()}\n")
        return True
    except OSError as e:
        log(f"[INBOX][SCAN][LOCK][ERROR] Failed to acquire lock: {e}")
        return False

def release_scan_lock():
    """Release global scan lock"""
    try:
        if os.path.exists(SCAN_LOCK_PATH):
            os.remove(SCAN_LOCK_PATH)
    except OSError as e:
        log(f"[INBOX][SCAN][LOCK][ERROR] Failed to release lock: {e}")

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
        vendor_output = result.stdout.strip()

        if result.returncode == 0 and vendor_output:
            log(f"[VENDOR_ROUTER] Detected vendor: {vendor_output}")
            return vendor_output
        else:
            stderr_msg = result.stderr.strip() if result.stderr else "No output"
            log(f"[VENDOR_ROUTER][ERROR] Failed for {os.path.basename(filepath)}: {stderr_msg}")
            return None
    except subprocess.TimeoutExpired:
        log(f"[VENDOR_ROUTER][TIMEOUT] Timeout for {os.path.basename(filepath)}")
        return None
    except Exception as e:
        log(f"[VENDOR_ROUTER][ERROR] Exception: {e}")
        return None

def process_attachments(msg, email_subject):
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")

    pdf_count = 0
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        if part.get('Content-Disposition') is None:
            continue

        filename = part.get_filename()
        if filename and filename.lower().endswith(".pdf"):
            pdf_count += 1
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
                log(f"⏩ Ignored: unknown or unparseable vendor for {filename}")

    if pdf_count == 0:
        log(f"⚠️ No PDFs found in email: {email_subject}")

def move_to_processed(mail, uid):
    # Mark as read instead of deleted
    mail.uid('store', uid, '+FLAGS', '\\Seen')

def check_inbox():
    """Main inbox scanning function with locking and deduplication"""
    global _last_scan_result

    # Try to acquire lock
    if not acquire_scan_lock():
        log("[INBOX][SCAN][BUSY] Scan already in progress, skipping")
        return

    start_time = time.time()
    log("[INBOX][SCAN][START] Beginning inbox scan")

    try:
        # Load existing invoices for cross-reference
        existing_invoices = load_existing_invoices()
        log(f"[INBOX][SCAN] Loaded {len(existing_invoices)} existing invoices from queue")

        mail = connect_imap()
        mail.select("INBOX")

        # Get ALL emails, not just unseen
        status, messages = mail.uid('search', None, 'ALL')
        if status != 'OK':
            log("[INBOX][SCAN][ERROR] Failed to search inbox")
            _last_scan_result["error"] = "Failed to search inbox"
            return

        email_uids = messages[0].split() if messages[0] else []
        log(f"[INBOX][SCAN] Found {len(email_uids)} emails in inbox")

        processed_count = 0
        skipped_count = 0
        no_pdf_count = 0

        for uid in email_uids:
            status, msg_data = mail.uid('fetch', uid, '(RFC822)')
            if status != 'OK':
                continue
            msg = email.message_from_bytes(msg_data[0][1])

            # Compute message key for deduplication
            message_key = compute_message_key(msg, uid)

            # Check if we've seen this message before
            if is_message_seen(message_key):
                skipped_count += 1
                continue

            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode(errors='ignore')

            # Check if this invoice is already processed
            if is_invoice_already_processed(subject, existing_invoices):
                mark_message_seen(message_key)
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
                log(f"[INBOX][SCAN] Processing new invoice email: {subject}")
                process_attachments(msg, subject)
                move_to_processed(mail, uid)
                mark_message_seen(message_key)
                processed_count += 1
            else:
                # Email has no PDF - log it for debugging
                sender = msg.get("From", "unknown")
                log(f"[INBOX][SCAN][NO_PDF] Skipping email without PDF - From: {sender}, Subject: {subject}")
                mark_message_seen(message_key)
                no_pdf_count += 1
                skipped_count += 1

        duration_ms = int((time.time() - start_time) * 1000)
        log(f"[INBOX][SCAN][END] Processed {processed_count} new, skipped {skipped_count} (no PDF: {no_pdf_count}), duration {duration_ms}ms")

        # Update last scan result
        _last_scan_result = {
            "timestamp": datetime.now().isoformat(),
            "added": processed_count,
            "skipped": skipped_count,
            "duration_ms": duration_ms,
            "error": None,
        }

        mail.logout()

        # Reset backoff on success
        _config["backoff_seconds"] = 10

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        log(f"[INBOX][SCAN][ERROR] Exception in inbox check: {e}")
        _last_scan_result = {
            "timestamp": datetime.now().isoformat(),
            "added": 0,
            "skipped": 0,
            "duration_ms": duration_ms,
            "error": str(e),
        }

        # Increase backoff on error
        _config["backoff_seconds"] = min(
            _config["backoff_seconds"] * 2,
            _config["max_backoff_seconds"]
        )
        log(f"[INBOX][SCAN][BACKOFF] Increased backoff to {_config['backoff_seconds']}s")

    finally:
        # Always run deduplication after each check to keep queue clean
        try:
            log("[INBOX][SCAN][DEDUPE] Running invoice queue deduplication...")
            deduplicate_invoices()
        except Exception as de:
            log(f"[INBOX][SCAN][DEDUPE][ERROR] Deduplication error: {de}")

        # Always release lock
        release_scan_lock()

if __name__ == "__main__":
    # Initialize database on startup
    init_ingest_db()

    interval_ms = _config["interval_ms"]
    log(f"[INBOX][WATCHER][START] Starting inbox watcher with {interval_ms}ms interval")
    log(f"[INBOX][WATCHER][CONFIG] PCS_DATA_DIR={DATA_DIR}")
    log(f"[INBOX][WATCHER][CONFIG] IMAP_SERVER={IMAP_SERVER}")

    while True:
        # Check inbox
        check_inbox()

        # Calculate sleep time with jitter (±15%)
        base_interval_s = _config["interval_ms"] / 1000.0

        # If we're in backoff mode, use backoff interval instead
        if _config["backoff_seconds"] > 10:
            base_interval_s = _config["backoff_seconds"]
            log(f"[INBOX][WATCHER][BACKOFF] Using backoff interval: {base_interval_s}s")

        jitter = random.uniform(-0.15, 0.15)  # ±15%
        sleep_time = base_interval_s * (1 + jitter)

        log(f"[INBOX][WATCHER][SLEEP] Sleeping for {sleep_time:.1f}s (base: {base_interval_s}s, jitter: {jitter*100:.1f}%)")
        time.sleep(sleep_time)
