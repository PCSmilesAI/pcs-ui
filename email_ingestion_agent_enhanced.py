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
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
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
DB_PATH = os.path.join(DATA_DIR, "pcs.db")

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

# Buffered logging
_log_buffer = []
_log_buffer_size = 50

def flush_logs():
    """Flush buffered logs to file"""
    global _log_buffer
    if _log_buffer:
        try:
            with open(LOG_PATH, "a") as f:
                f.write("".join(_log_buffer))
            _log_buffer = []
        except Exception as e:
            print(f"Error flushing logs: {e}")

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
    """Structured logging with buffering"""
    global _log_buffer
    timestamp = datetime.now().isoformat()
    log_line = f"[{timestamp}] {msg}\n"
    _log_buffer.append(log_line)
    print(log_line.rstrip())

    # Flush when buffer reaches size
    if len(_log_buffer) >= _log_buffer_size:
        flush_logs()


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
    """Load existing invoices and build efficient lookup structures"""
    invoices = []
    invoice_numbers = set()  # For O(1) lookup
    message_ids = set()      # For O(1) lookup
    tombstones = set()       # For O(1) tombstone lookup

    # Try to load from SQLite database first (new system)
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Get all invoices from database
            cursor.execute("""
                SELECT id, invoice_number, source_message_id, vendor_name, amount_cents
                FROM invoices
                WHERE deleted = 0
            """)

            for row in cursor.fetchall():
                invoices.append({
                    'id': row['id'],
                    'invoice_number': row['invoice_number'],
                    'source_message_id': row['source_message_id'],
                    'vendor_name': row['vendor_name'],
                    'amount_cents': row['amount_cents'],
                })
                if row['invoice_number']:
                    invoice_numbers.add(row['invoice_number'].lower())
                if row['source_message_id']:
                    message_ids.add(row['source_message_id'])

            # Load tombstones for deleted invoices
            cursor.execute("SELECT source_message_id FROM tombstones")
            for row in cursor.fetchall():
                if row[0]:
                    tombstones.add(row[0])

            conn.close()
            log(f"[INBOX][DB] Loaded {len(invoices)} invoices, {len(tombstones)} tombstones")
            return invoices, invoice_numbers, message_ids, tombstones

        except Exception as e:
            log(f"[INBOX][DB][ERROR] Error loading from database: {e}")

    # Fallback: Load from JSON queue (old system)
    if os.path.exists(INVOICE_QUEUE_PATH):
        try:
            with open(INVOICE_QUEUE_PATH, 'r') as f:
                data = json.load(f)
            invoices = data if isinstance(data, list) else []
            for inv in invoices:
                if inv.get('invoice_number'):
                    invoice_numbers.add(inv['invoice_number'].lower())
            log(f"[INBOX][JSON] Loaded {len(invoices)} invoices from JSON queue (fallback)")
            return invoices, invoice_numbers, message_ids, tombstones
        except Exception as e:
            log(f"[INBOX][JSON][ERROR] Error loading from JSON: {e}")

    log("[INBOX][LOAD] No invoices found in database or JSON")
    return [], invoice_numbers, message_ids, tombstones

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

def is_invoice_already_processed(email_subject, invoice_numbers, message_ids, tombstones, source_message_id=None):
    """Check if this invoice is already in the PCS AI system or has been deleted (O(1) lookups)"""
    if not email_subject:
        return False

    # Check if this message was previously deleted (tombstone check) - O(1)
    if source_message_id and source_message_id in tombstones:
        log(f"[INBOX][TOMBSTONE] Message {source_message_id} was previously deleted, skipping")
        return True

    # Check if source_message_id matches (most reliable) - O(1)
    if source_message_id and source_message_id in message_ids:
        log(f"[INBOX][DUPLICATE] Message ID {source_message_id} already processed")
        return True

    # Extract potential invoice number from subject
    subject_invoice_num = extract_invoice_number_from_subject(email_subject)

    # Check if invoice number matches - O(1)
    if subject_invoice_num and subject_invoice_num.lower() in invoice_numbers:
        log(f"[INBOX][DUPLICATE] Invoice {subject_invoice_num} already exists in PCS AI")
        return True

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

def extract_and_save_pdfs(msg, email_subject, source_message_id):
    """Extract PDFs from email and return list of filepaths

    CRITICAL: Each email gets a unique filename to prevent collisions
    CRITICAL: Check ALL parts, not just those with Content-Disposition header
    """
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")

    pdf_files = []
    for part in msg.walk():
        # Skip multipart containers
        if part.get_content_maintype() == 'multipart':
            continue

        # CRITICAL FIX: Don't skip parts without Content-Disposition
        # Some emails have attachments without this header
        # Instead, check if the part has a filename
        filename = part.get_filename()

        # If no filename in Content-Disposition, check Content-Type
        if not filename:
            content_type = part.get_content_type()
            # Check if this looks like an attachment based on content type
            if content_type.startswith('application/'):
                # Try to extract filename from Content-Type parameters
                params = part.get_params()
                if params:
                    for key, value in params:
                        if key.lower() == 'name':
                            filename = value
                            break

        # Only process if we have a filename and it's a PDF
        if filename and filename.lower().endswith(".pdf"):
            log(f"[EXTRACT] Found PDF attachment: {filename}")

            # CRITICAL FIX: Use message ID to create unique filename
            # This prevents collisions when different emails have PDFs with same name
            if source_message_id:
                # Create unique filename: original_name_MESSAGEID.pdf
                name_without_ext = os.path.splitext(filename)[0]
                unique_filename = f"{name_without_ext}_{hashlib.md5(source_message_id.encode()).hexdigest()[:8]}.pdf"
            else:
                # Fallback: use timestamp
                timestamp = int(time.time() * 1000)
                name_without_ext = os.path.splitext(filename)[0]
                unique_filename = f"{name_without_ext}_{timestamp}.pdf"

            filepath = os.path.join(SAVE_DIR, unique_filename)

            # CRITICAL: Always save the PDF, even if filename exists
            # Different emails may have PDFs with same name
            try:
                with open(filepath, 'wb') as f:
                    f.write(part.get_payload(decode=True))
                log(f"✅ Saved: {unique_filename}")
                pdf_files.append((filepath, detected_vendor))
            except Exception as e:
                log(f"[ERROR] Failed to save PDF {unique_filename}: {e}")
                continue

    if not pdf_files:
        log(f"⚠️ No PDFs found in email: {email_subject}")

    return pdf_files

def process_pdf_file(filepath, detected_vendor):
    """Process a single PDF file (can be called in parallel)

    CRITICAL: This function MUST NOT fail silently
    """
    try:
        if not os.path.exists(filepath):
            log(f"[ERROR][CRITICAL] PDF file does not exist: {filepath}")
            return False

        vendor = run_vendor_router(filepath, detected_vendor)
        if vendor:
            log(f"📦 Parsed and routed invoice: {vendor}")
            return True
        else:
            log(f"[WARNING] Unknown or unparseable vendor for {os.path.basename(filepath)}")
            return False
    except Exception as e:
        log(f"[ERROR][CRITICAL] Failed to process {os.path.basename(filepath)}: {e}")
        import traceback
        log(f"[ERROR][TRACEBACK] {traceback.format_exc()}")
        return False

def move_to_processed(mail, uid):
    """Mark email as read"""
    mail.uid('store', uid, '+FLAGS', '\\Seen')

def verify_pdf_processing(pdf_tasks):
    """CRITICAL: Verify that all extracted PDFs are being processed

    This is a safety check to ensure we don't lose invoices
    """
    if not pdf_tasks:
        return True

    log(f"[VERIFY] Checking that all {len(pdf_tasks)} PDFs exist before processing...")
    missing_pdfs = []
    for filepath, vendor in pdf_tasks:
        if not os.path.exists(filepath):
            missing_pdfs.append(filepath)
            log(f"[VERIFY][ERROR] PDF missing: {filepath}")

    if missing_pdfs:
        log(f"[VERIFY][CRITICAL] {len(missing_pdfs)} PDFs are missing!")
        return False

    log(f"[VERIFY] All {len(pdf_tasks)} PDFs verified to exist")
    return True

def check_inbox(full_scan=False):
    """Main inbox scanning function with parallel processing and incremental scanning

    Args:
        full_scan: If True, scan ALL emails (not just unread). Used for one-time full inbox analysis.
                   In full_scan mode, we compare ALL emails in inbox to database and import missing ones.
    """
    global _last_scan_result

    # Try to acquire lock
    if not acquire_scan_lock():
        log("[INBOX][SCAN][BUSY] Scan already in progress, skipping")
        return

    start_time = time.time()
    scan_mode = "FULL" if full_scan else "UNREAD"
    log(f"[INBOX][SCAN][START] Beginning {scan_mode} inbox scan")

    try:
        # Load existing invoices with efficient lookup structures
        existing_invoices, invoice_numbers, message_ids, tombstones = load_existing_invoices()
        log(f"[INBOX][SCAN] Loaded {len(existing_invoices)} existing invoices from database")

        mail = connect_imap()
        mail.select("INBOX")

        # Get emails based on scan mode
        if full_scan:
            # FULL SCAN: Get ALL emails (for one-time analysis)
            # In full_scan mode, we DON'T skip already-processed emails
            # Instead, we compare ALL emails to database and import missing ones
            log("[INBOX][SCAN][MODE] FULL SCAN - Processing ALL emails in inbox, comparing to database")
            status, messages = mail.uid('search', None, 'ALL')
        else:
            # NORMAL SCAN: Get UNREAD emails only (UNSEEN flag)
            status, messages = mail.uid('search', None, 'UNSEEN')

        if status != 'OK':
            log("[INBOX][SCAN][ERROR] Failed to search inbox")
            _last_scan_result["error"] = "Failed to search inbox"
            return

        email_uids = messages[0].split() if messages[0] else []
        scan_type = "all" if full_scan else "unread"
        log(f"[INBOX][SCAN] Found {len(email_uids)} {scan_type} emails in inbox")

        processed_count = 0
        skipped_count = 0
        no_pdf_count = 0
        pdf_tasks = []  # For parallel processing

        # First pass: identify new emails and extract PDFs
        for uid in email_uids:
            status, msg_data = mail.uid('fetch', uid, '(RFC822)')
            if status != 'OK':
                continue
            msg = email.message_from_bytes(msg_data[0][1])

            source_message_id = msg.get("Message-ID", "")
            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode(errors='ignore')

            # In full_scan mode, ONLY skip if message was deleted (tombstone)
            # Otherwise, we want to re-import all emails to ensure database is in sync
            if full_scan:
                # Only skip if this message was previously deleted
                if source_message_id and source_message_id in tombstones:
                    log(f"[INBOX][TOMBSTONE] Message {source_message_id} was previously deleted, skipping")
                    skipped_count += 1
                    continue
                # In full_scan, we process ALL other emails, even if they look like duplicates
                log(f"[INBOX][SCAN][FULL] Processing email in full scan mode: {subject}")
            else:
                # In normal mode, skip already processed invoices
                if is_invoice_already_processed(subject, invoice_numbers, message_ids, tombstones, source_message_id):
                    skipped_count += 1
                    continue

            # Check if email has PDF attachments
            # CRITICAL: Check ALL parts, not just those with Content-Disposition
            has_pdf = False
            for part in msg.walk():
                if part.get_content_maintype() == 'multipart':
                    continue

                # Check for filename in Content-Disposition
                filename = part.get_filename()

                # If no filename, check Content-Type for attachments
                if not filename:
                    content_type = part.get_content_type()
                    if content_type.startswith('application/'):
                        params = part.get_params()
                        if params:
                            for key, value in params:
                                if key.lower() == 'name':
                                    filename = value
                                    break

                # Check if it's a PDF
                if filename and filename.lower().endswith(".pdf"):
                    has_pdf = True
                    break

            if has_pdf:
                log(f"[INBOX][SCAN] Processing invoice email: {subject}")
                pdf_files = extract_and_save_pdfs(msg, subject, source_message_id)
                # Queue PDFs for parallel processing
                for filepath, detected_vendor in pdf_files:
                    pdf_tasks.append((filepath, detected_vendor))
                # CRITICAL FIX: Only mark as read AFTER successfully extracting PDFs
                # This ensures we don't lose emails if extraction fails
                if pdf_files:
                    # Only mark as processed in normal mode
                    # In full_scan mode, leave emails as-is so they can be re-scanned
                    if not full_scan:
                        move_to_processed(mail, uid)
                    processed_count += 1
                else:
                    log(f"[INBOX][SCAN][WARNING] Email had PDF flag but no PDFs extracted: {subject}")
                    skipped_count += 1
            else:
                sender = msg.get("From", "unknown")
                log(f"[INBOX][SCAN][NO_PDF] Skipping email without PDF - From: {sender}, Subject: {subject}")
                no_pdf_count += 1
                skipped_count += 1

        mail.logout()

        # CRITICAL: Verify all PDFs exist before processing
        if pdf_tasks and not verify_pdf_processing(pdf_tasks):
            log("[INBOX][SCAN][CRITICAL] PDF verification failed - aborting processing")
            _last_scan_result = {
                "timestamp": datetime.now().isoformat(),
                "added": 0,
                "skipped": skipped_count,
                "duration_ms": int((time.time() - start_time) * 1000),
                "error": "PDF verification failed",
            }
            return

        # Second pass: process PDFs in parallel
        if pdf_tasks:
            log(f"[INBOX][PARALLEL] Processing {len(pdf_tasks)} PDFs with thread pool")
            processed_pdfs = 0
            failed_pdfs = 0
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(process_pdf_file, filepath, vendor) for filepath, vendor in pdf_tasks]
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        if result:
                            processed_pdfs += 1
                        else:
                            failed_pdfs += 1
                    except Exception as e:
                        failed_pdfs += 1
                        log(f"[INBOX][PARALLEL][ERROR] {e}")

            log(f"[INBOX][PARALLEL][SUMMARY] Processed: {processed_pdfs}, Failed: {failed_pdfs}")
            if failed_pdfs > 0:
                log(f"[INBOX][PARALLEL][WARNING] {failed_pdfs} PDFs failed to process - check logs")

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
        # Flush any remaining logs
        flush_logs()

        # Only run deduplication if new invoices were added
        if processed_count > 0:
            try:
                log("[INBOX][SCAN][DEDUPE] Running invoice queue deduplication...")
                deduplicate_invoices()
            except Exception as de:
                log(f"[INBOX][SCAN][DEDUPE][ERROR] Deduplication error: {de}")

        # Always release lock
        release_scan_lock()

if __name__ == "__main__":
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
