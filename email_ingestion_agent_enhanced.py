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
import select
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from deduplicate_invoices import deduplicate_invoices
from filename_utils import sanitize_filename

EMAIL_USER = os.environ.get("IMAP_USER", "invoices@pcsmilesai.com")
EMAIL_PASS = os.environ.get("IMAP_PASS", "PCS-AI-2026!")
IMAP_SERVER = os.environ.get("IMAP_SERVER", "imap.secureserver.net")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(BASE_DIR, "pcs_ui_data"))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(DATA_DIR)

# Persist all artifacts under PCS_DATA_DIR to keep API/file access aligned
SAVE_DIR = os.path.join(DATA_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
LOG_PATH = os.path.join(DATA_DIR, "log.txt")
INVOICE_QUEUE_PATH = os.path.join(BASE_DIR, "pcs_ai_data", "invoice_queue.json")
DB_PATH = os.path.join(DATA_DIR, "pcs.db")

# Runtime configuration
LOCKS_DIR = os.path.join(DATA_DIR, "locks")
INGEST_DB_PATH = os.path.join(DATA_DIR, "ingest.db")
SCAN_LOCK_PATH = os.path.join(LOCKS_DIR, "inbox.scan.lock")
DELETED_INVOICES_PATH = os.path.join(DATA_DIR, "deleted_invoices.json")

# API Configuration for PCS AI Document Classification
# Use local API in development, or the production server URL
API_BASE_URL = os.environ.get("PCS_API_URL", "http://localhost:3000")

# Create necessary directories
os.makedirs(SAVE_DIR, exist_ok=True)
os.makedirs(LOCKS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Heartbeat file so the health API can verify the watcher is alive
HEARTBEAT_PATH = os.path.join(DATA_DIR, "inbox_heartbeat.json")

# Global configuration (can be reloaded via SIGHUP)
_config = {
    "interval_ms": int(os.environ.get("INBOX_SCAN_INTERVAL_MS", "10000")),  # Default 10s
    "backoff_seconds": 10,  # Start at 10s
    "max_backoff_seconds": 300,  # Cap at 5 minutes
    "last_error_time": None,  # Track when the last error happened for backoff reset
}

# Global state
_last_scan_result = {
    "timestamp": None,
    "added": 0,
    "skipped": 0,
    "duration_ms": 0,
    "error": None,
}

# =============================================================================
# VENDOR FILTER: Only process invoices from these vendors
# Set to None or empty list to process ALL vendors
# Currently restricted to TC Dental for live production launch
# =============================================================================
# These keywords are used for IMAP server-side SUBJECT/FROM search.
# Real email subjects include: "salem - tc invoices", "Fw: tc lab", "Fw: tc 1", "tc dental"
# We use broad patterns to catch all TC Dental forwarding styles from office managers.
ACTIVE_VENDOR_FILTER = ['tc dental', 'tcdentallab', 'tc dental lab', 'tcdental',
                        'tc invoices', 'tc invoice', 'tc lab', 'tc ']

# Priority senders: always fetch ALL emails from these addresses regardless of subject.
# Emails are still filtered by vendor keywords in subject, FROM, or attachment filenames.
PRIORITY_SENDERS = ['laurag@pcsmiles.com', 'laurag@pacificcrestsmiles.com']

# IMAP folders to scan (in addition to INBOX)
# GoDaddy email uses "Junk" and "Spam" folders
EXTRA_FOLDERS = ['Junk', 'Spam']

def has_vendor_attachment(msg):
    """Check if any PDF attachment filename contains active vendor keywords."""
    if not ACTIVE_VENDOR_FILTER:
        return False
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        filename = part.get_filename()
        if not filename:
            params = part.get_params()
            if params:
                for key, value in params:
                    if key.lower() == 'name':
                        filename = value
                        break
        if filename and filename.lower().endswith('.pdf'):
            fn_lower = filename.lower()
            for vendor_keyword in ACTIVE_VENDOR_FILTER:
                if vendor_keyword.lower() in fn_lower:
                    return True
    return False


def is_email_from_active_vendor(msg, subject_str):
    """Check if an email is from one of the active vendors we should process.
    Checks subject, sender, priority senders list, and PDF attachment filenames.
    Returns True if the email should be processed, False if it should be skipped.
    If ACTIVE_VENDOR_FILTER is empty/None, all emails are processed."""
    if not ACTIVE_VENDOR_FILTER:
        return True
    
    sender = msg.get("From", "").lower()
    subject_lower = (subject_str or "").lower()
    
    for vendor_keyword in ACTIVE_VENDOR_FILTER:
        vk = vendor_keyword.lower()
        if vk in sender or vk in subject_lower:
            return True
    
    # For priority senders and any other email, check PDF attachment filenames
    # This catches cases where Laura forwards TC Dental with a vague subject
    if has_vendor_attachment(msg):
        return True
    
    return False

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
    new_interval = int(os.environ.get("INBOX_SCAN_INTERVAL_MS", "10000"))
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

def _get_ingest_db():
    """Get a connection to the ingest tracking database"""
    conn = sqlite3.connect(INGEST_DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS seen_messages (
        message_key TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        first_seen_ts TEXT NOT NULL,
        last_seen_ts TEXT NOT NULL
    )""")
    return conn


def load_seen_message_keys():
    """Load all seen message keys from the ingest tracking DB for fast O(1) lookup"""
    try:
        conn = _get_ingest_db()
        cursor = conn.execute("SELECT message_key FROM seen_messages")
        keys = {row[0] for row in cursor.fetchall()}
        conn.close()
        return keys
    except Exception as e:
        log(f"[INBOX][SEEN_DB][ERROR] Failed to load seen messages: {e}")
        return set()


def mark_email_seen(message_key):
    """Record that an email has been processed so it won't be re-processed"""
    try:
        conn = _get_ingest_db()
        now = datetime.now().isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO seen_messages (message_key, provider, first_seen_ts, last_seen_ts) VALUES (?, ?, ?, ?)",
            (message_key, "imap", now, now),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log(f"[INBOX][SEEN_DB][ERROR] Failed to mark seen: {e}")


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

def write_heartbeat(status="ok", error=None):
    """Write heartbeat file so the health API can verify the watcher is alive"""
    try:
        heartbeat = {
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "pid": os.getpid(),
            "error": error,
            "last_scan": _last_scan_result,
        }
        with open(HEARTBEAT_PATH, "w") as f:
            json.dump(heartbeat, f)
    except Exception as e:
        print(f"[HEARTBEAT][ERROR] Failed to write heartbeat: {e}")


def connect_imap(max_retries=3, retry_delay=5):
    """Connect to IMAP with retry logic and error classification.
    
    Auth failures are NOT retried (they won't self-heal).
    Connection/timeout errors are retried up to max_retries times.
    """
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            return mail
        except imaplib.IMAP4.error as e:
            err_msg = str(e).lower()
            if 'login' in err_msg or 'auth' in err_msg or 'credentials' in err_msg:
                log(f"[IMAP][AUTH][CRITICAL] Authentication failed: {e} — will NOT retry")
                raise
            last_err = e
            log(f"[IMAP][CONNECT][RETRY] Attempt {attempt}/{max_retries} failed: {e}")
        except (OSError, TimeoutError, ConnectionError) as e:
            last_err = e
            log(f"[IMAP][CONNECT][RETRY] Attempt {attempt}/{max_retries} failed: {e}")
        
        if attempt < max_retries:
            time.sleep(retry_delay)
    
    raise last_err or Exception("IMAP connection failed after retries")

def detect_vendor_from_email(msg):
    sender = msg.get("From", "").lower()
    subject = msg.get("Subject", "").lower()
    
    vendor_patterns = {
        'epic': ['epic', 'epic dental'],
        'patterson': ['patterson', 'pattersondental'],
        'henry': ['henry schein', 'henryschein'],
        'exodus': ['exodus', 'exodus dental'],
        'artisan': ['artisan', 'artisan dental'],
        'tc': ['tc dental', 'tc dental supply', 'tc dental lab', 'tcdentallab',
               'tcdental', 'tc invoices', 'tc invoice', 'tc lab']
    }
    
    for vendor, patterns in vendor_patterns.items():
        for pattern in patterns:
            if pattern in sender or pattern in subject:
                return vendor
    return None

def run_vendor_router(filepath, detected_vendor=None):
    """DEPRECATED: Use parse_invoice_with_pcs_ai instead"""
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


def parse_invoice_with_gpt(filepath, vendor_hint=None):
    """
    Call the PCS AI invoice ingest API to parse and save an invoice.
    Uses PCS AI for intelligent parsing.
    
    Returns:
        dict with invoice data if successful, None if failed
    """
    try:
        log(f"[GPT_INGEST] Parsing invoice with GPT: {os.path.basename(filepath)}")
        
        payload = {
            "pdf_path": filepath,
            "source_file": filepath
        }
        
        if vendor_hint:
            payload["vendor_hint"] = vendor_hint
        
        response = requests.post(
            f"{API_BASE_URL}/api/invoices/gpt-ingest",
            json=payload,
            timeout=600  # 10 min — large multi-page PDFs (30+ pages) need 5+ min for GPT vision
        )
        
        if response.status_code != 200:
            log(f"[PCS_AI_INGEST][ERROR] API returned status {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        
        if not data.get("ok"):
            log(f"[PCS_AI_INGEST][ERROR] Ingest failed: {data.get('error', 'Unknown error')}")
            return None
        
        # Check if skipped (already exists or tombstoned)
        if data.get("skipped"):
            log(f"[PCS_AI_INGEST][SKIP] Invoice skipped: {data.get('message')}")
            return {"skipped": True, "message": data.get("message")}
        
        if data.get("duplicate"):
            log(f"[PCS_AI_INGEST][DUPLICATE] Invoice duplicate blocked: {data.get('message')}")
            return {"skipped": True, "duplicate": True, "message": data.get("message")}
        
        log(f"[PCS_AI_INGEST][SUCCESS] Invoice parsed: #{data.get('invoice_number')} - {data.get('vendor')} - ${data.get('amount', 0):.2f}")
        
        return {
            "id": data.get("id"),
            "invoice_number": data.get("invoice_number"),
            "vendor": data.get("vendor"),
            "amount": data.get("amount"),
            "parsing_status": data.get("parsing_status"),
            "parsing_confidence": data.get("parsing_confidence"),
            "success": True
        }
        
    except requests.exceptions.Timeout:
        log(f"[PCS_AI_INGEST][TIMEOUT] Parsing timeout for {os.path.basename(filepath)}")
        return None
    except requests.exceptions.RequestException as e:
        log(f"[PCS_AI_INGEST][ERROR] Request failed: {e}")
        return None
    except Exception as e:
        log(f"[PCS_AI_INGEST][ERROR] Exception during parsing: {e}")
        return None


def classify_document_with_gpt(filepath, email_context=None):
    """
    Call the PCS AI document classification API to determine document type.
    
    Returns:
        dict with keys: document_type, confidence, vendor_name, amount, document_date, reference_number, reasoning
        or None if classification fails
    """
    try:
        log(f"[PCS_AI_CLASSIFY] Classifying document: {os.path.basename(filepath)}")
        
        payload = {
            "pdfPath": filepath
        }
        
        if email_context:
            payload["emailContext"] = email_context
        
        response = requests.post(
            f"{API_BASE_URL}/api/gpt-classify",
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            log(f"[PCS_AI_CLASSIFY][ERROR] API returned status {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        
        if not data.get("success"):
            log(f"[PCS_AI_CLASSIFY][ERROR] Classification failed: {data.get('error', 'Unknown error')}")
            return None

        classification = data.get("classification", {})
        log(f"[PCS_AI_CLASSIFY] Result: type={classification.get('document_type')}, confidence={classification.get('confidence')}")
        
        return classification
        
    except requests.exceptions.Timeout:
        log(f"[PCS_AI_CLASSIFY][TIMEOUT] Classification timeout for {os.path.basename(filepath)}")
        return None
    except requests.exceptions.RequestException as e:
        log(f"[PCS_AI_CLASSIFY][ERROR] Request failed: {e}")
        return None
    except Exception as e:
        log(f"[PCS_AI_CLASSIFY][ERROR] Exception during classification: {e}")
        return None


def save_other_document(filepath, classification, email_context=None):
    """
    Save a non-invoice document to the other_documents table via API.
    
    Args:
        filepath: Path to the PDF file
        classification: Classification result from PCS AI
        email_context: Optional email metadata (subject, from, body)
    
    Returns:
        bool: True if saved successfully, False otherwise
    """
    try:
        log(f"[OTHER_DOC] Saving {classification.get('document_type')} document: {os.path.basename(filepath)}")
        
        # Build the document record
        payload = {
            "document_type": classification.get("document_type", "other"),
            "vendor_name": classification.get("vendor_name"),
            "amount": classification.get("amount"),
            "document_date": classification.get("document_date"),
            "reference_number": classification.get("reference_number"),
            "pdf_path": filepath,
            "classification_confidence": classification.get("confidence"),
            "raw_extracted_data": classification
        }
        
        # Add email context if available
        if email_context:
            payload["email_subject"] = email_context.get("subject")
            payload["email_from"] = email_context.get("from")
        
        response = requests.post(
            f"{API_BASE_URL}/api/other-documents",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"[OTHER_DOC][ERROR] API returned status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if data.get("success"):
            log(f"[OTHER_DOC] Saved document with ID: {data.get('document', {}).get('id')}")
            return True
        else:
            log(f"[OTHER_DOC][ERROR] Failed to save: {data.get('error', 'Unknown error')}")
            return False
            
    except requests.exceptions.Timeout:
        log(f"[OTHER_DOC][TIMEOUT] Timeout saving document")
        return False
    except requests.exceptions.RequestException as e:
        log(f"[OTHER_DOC][ERROR] Request failed: {e}")
        return False
    except Exception as e:
        log(f"[OTHER_DOC][ERROR] Exception: {e}")
        return False

def extract_and_save_pdfs(msg, email_subject, source_message_id):
    """Extract PDFs from email and return list of filepaths with email context

    CRITICAL: Each email gets a unique filename to prevent collisions
    CRITICAL: Check ALL parts, not just those with Content-Disposition header
    
    Returns:
        list of tuples: (filepath, detected_vendor, email_context)
    """
    detected_vendor = detect_vendor_from_email(msg)
    if detected_vendor:
        log(f"📧 Vendor detected from email: {detected_vendor}")

    # Extract email context for PCS AI classification
    email_from = msg.get("From", "")
    email_body = ""
    for part in msg.walk():
        if part.get_content_type() == 'text/plain':
            try:
                email_body = part.get_payload(decode=True).decode(errors='ignore')[:500]  # First 500 chars
            except:
                pass
            break
    
    email_context = {
        "subject": email_subject,
        "from": email_from,
        "body": email_body
    }

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

            unique_filename = sanitize_filename(unique_filename)
            filepath = os.path.join(SAVE_DIR, unique_filename)

            # CRITICAL: Always save the PDF, even if filename exists
            # Different emails may have PDFs with same name
            try:
                with open(filepath, 'wb') as f:
                    f.write(part.get_payload(decode=True))
                log(f"✅ Saved: {unique_filename}")
                pdf_files.append((filepath, detected_vendor, email_context))
            except Exception as e:
                log(f"[ERROR] Failed to save PDF {unique_filename}: {e}")
                continue

    if not pdf_files:
        log(f"⚠️ No PDFs found in email: {email_subject}")

    return pdf_files

def process_pdf_file(filepath, detected_vendor, email_context=None):
    """Process a single PDF file with PCS AI for classification and parsing

    CRITICAL: This function MUST NOT fail silently
    
    Flow:
    1. If vendor already known from email metadata, skip classification and parse directly
    2. Otherwise classify document using PCS AI
    3. If invoice -> parse with PCS AI and save to database
    4. If other document type -> save to other_documents table
    """
    try:
        if not os.path.exists(filepath):
            log(f"[ERROR][CRITICAL] PDF file does not exist: {filepath}")
            return False

        # Fast path: if vendor is already known from email sender/subject, skip classification
        # (saves ~60s per PDF for the most common TC Dental case)
        if detected_vendor and detected_vendor.lower() not in ('unknown', ''):
            log(f"[CLASSIFY][SKIP] Vendor already known ({detected_vendor}), skipping classification — parsing directly")
            result = parse_invoice_with_gpt(filepath, detected_vendor)
            if result and result.get("success"):
                log(f"📦 Parsed invoice (fast path): {result.get('vendor', 'Unknown')} - ${(result.get('amount') or 0):.2f}")
                return True
            elif result and result.get("skipped"):
                log(f"📦 Invoice skipped (already exists): {os.path.basename(filepath)}")
                return True
            else:
                log(f"[WARNING] PCS AI parsing failed for {os.path.basename(filepath)}")
                return False

        # Step 1: Classify the document using PCS AI
        classification = classify_document_with_gpt(filepath, email_context)
        
        # If classification fails, fall back to treating as invoice and parse with PCS AI
        if not classification:
            log(f"[CLASSIFY][FALLBACK] Classification failed, treating as invoice: {os.path.basename(filepath)}")
            result = parse_invoice_with_gpt(filepath, detected_vendor)
            if result and result.get("success"):
                log(f"📦 Parsed invoice with PCS AI (fallback): {result.get('vendor', 'Unknown')}")
                return True
            elif result and result.get("skipped"):
                log(f"📦 Invoice skipped (already exists): {os.path.basename(filepath)}")
                return True
            else:
                log(f"[WARNING] PCS AI parsing failed for {os.path.basename(filepath)}")
                return False
        
        document_type = classification.get("document_type", "other")
        confidence = classification.get("confidence", 0)
        
        log(f"[CLASSIFY] Document classified as '{document_type}' with {confidence:.1%} confidence")
        
        # Step 2: Route based on classification
        if document_type == "invoice":
            # Parse invoice with PCS AI and save to database
            result = parse_invoice_with_gpt(filepath, detected_vendor)
            if result and result.get("success"):
                log(f"📦 Parsed invoice with PCS AI: {result.get('vendor', 'Unknown')} - ${(result.get('amount') or 0):.2f}")
                return True
            elif result and result.get("skipped"):
                log(f"📦 Invoice skipped (already exists): {os.path.basename(filepath)}")
                return True
            else:
                log(f"[WARNING] PCS AI parsing failed for {os.path.basename(filepath)}")
                return False
        
        elif document_type == "marketing":
            # Skip marketing materials entirely
            log(f"📧 Skipping marketing material: {os.path.basename(filepath)}")
            return True  # Return True since we successfully handled it (by skipping)
        
        else:
            # Save to other_documents table (credit_memo, statement, payment_confirmation, other)
            if save_other_document(filepath, classification, email_context):
                log(f"📄 Saved {document_type}: {os.path.basename(filepath)}")
                return True
            else:
                log(f"[ERROR] Failed to save {document_type}: {os.path.basename(filepath)}")
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
    for task in pdf_tasks:
        # Handle both old (filepath, vendor) and new (filepath, vendor, email_context) formats
        filepath = task[0]
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

    # Initialize counters before try block to ensure they exist in finally
    processed_count = 0
    skipped_count = 0
    no_pdf_count = 0

    try:
        # Load existing invoices with efficient lookup structures
        existing_invoices, invoice_numbers, message_ids, tombstones = load_existing_invoices()
        log(f"[INBOX][SCAN] Loaded {len(existing_invoices)} existing invoices from database")

        # Load the set of email message_keys already processed by this scanner
        seen_keys = load_seen_message_keys()
        log(f"[INBOX][SCAN] Loaded {len(seen_keys)} seen message keys from ingest DB")

        mail = connect_imap()

        # Scan INBOX plus spam/junk folders
        folders_to_scan = ['INBOX'] + EXTRA_FOLDERS

        processed_count = 0
        skipped_count = 0
        no_pdf_count = 0
        pdf_tasks = []  # For parallel processing

        for folder_name in folders_to_scan:
            try:
                status, folder_count = mail.select(folder_name)
                if status != 'OK':
                    log(f"[INBOX][SCAN][FOLDER] Could not select folder '{folder_name}', skipping")
                    continue
                total_in_folder = int(folder_count[0]) if folder_count and folder_count[0] else 0
                if total_in_folder == 0:
                    log(f"[INBOX][SCAN][FOLDER] '{folder_name}' is empty, skipping")
                    continue
                log(f"[INBOX][SCAN][FOLDER] Scanning '{folder_name}' ({total_in_folder} emails)")
            except Exception as folder_err:
                log(f"[INBOX][SCAN][FOLDER] Error selecting '{folder_name}': {folder_err}")
                continue

            # Get emails based on scan mode
            if ACTIVE_VENDOR_FILTER:
                # Build a single consolidated OR query instead of 8+ separate round-trips
                search_parts = []
                for vendor_keyword in ACTIVE_VENDOR_FILTER:
                    for field in ['SUBJECT', 'FROM']:
                        search_parts.append(f'{field} "{vendor_keyword}"')
                for sender_email in PRIORITY_SENDERS:
                    search_parts.append(f'FROM "{sender_email}"')

                # Chain into nested OR: OR a (OR b (OR c d))
                if len(search_parts) == 1:
                    combined = search_parts[0]
                else:
                    combined = search_parts[-1]
                    for part in reversed(search_parts[:-1]):
                        combined = f'OR {part} {combined}'

                # For incremental scans, only fetch UNSEEN emails
                if not full_scan:
                    combined = f'UNSEEN {combined}'

                try:
                    status, messages = mail.uid('search', None, combined)
                    all_uids = set(messages[0].split()) if status == 'OK' and messages[0] else set()
                except Exception as search_err:
                    log(f"[INBOX][SCAN][WARN] Consolidated search failed in {folder_name}: {search_err}, falling back to individual searches")
                    all_uids = set()
                    for vendor_keyword in ACTIVE_VENDOR_FILTER:
                        for field in ['SUBJECT', 'FROM']:
                            try:
                                criteria = f'UNSEEN {field} "{vendor_keyword}"' if not full_scan else f'{field} "{vendor_keyword}"'
                                status, messages = mail.uid('search', None, criteria)
                                if status == 'OK' and messages[0]:
                                    for uid in messages[0].split():
                                        all_uids.add(uid)
                            except Exception:
                                pass
                    for sender_email in PRIORITY_SENDERS:
                        try:
                            criteria = f'UNSEEN FROM "{sender_email}"' if not full_scan else f'FROM "{sender_email}"'
                            status, messages = mail.uid('search', None, criteria)
                            if status == 'OK' and messages[0]:
                                for uid in messages[0].split():
                                    all_uids.add(uid)
                        except Exception:
                            pass

                email_uids = sorted(all_uids)
                unseen_tag = " (UNSEEN only)" if not full_scan else " (ALL)"
                log(f"[INBOX][SCAN][MODE] VENDOR-FILTERED SCAN{unseen_tag} in '{folder_name}' - Found {len(email_uids)} emails matching vendor filter + priority senders")
            elif full_scan:
                log(f"[INBOX][SCAN][MODE] FULL SCAN in '{folder_name}' - Processing ALL emails")
                status, messages = mail.uid('search', None, 'ALL')
                if status != 'OK':
                    log(f"[INBOX][SCAN][ERROR] Failed to search '{folder_name}'")
                    continue
                email_uids = messages[0].split() if messages[0] else []
                log(f"[INBOX][SCAN] Found {len(email_uids)} total emails in '{folder_name}'")
            else:
                log(f"[INBOX][SCAN][MODE] NORMAL SCAN in '{folder_name}' - UNSEEN only")
                status, messages = mail.uid('search', None, 'UNSEEN')
                if status != 'OK':
                    log(f"[INBOX][SCAN][ERROR] Failed to search '{folder_name}'")
                    continue
                email_uids = messages[0].split() if messages[0] else []
                log(f"[INBOX][SCAN] Found {len(email_uids)} unseen emails in '{folder_name}'")

            # First pass: lightweight header fetch for dedup, then full fetch only for new emails
            for uid in email_uids:
                # Lightweight fetch: only grab headers needed for dedup (avoids downloading multi-MB bodies)
                try:
                    status, header_data = mail.uid('fetch', uid, '(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM)])')
                    if status != 'OK' or not header_data or not header_data[0]:
                        continue
                    header_bytes = header_data[0][1] if isinstance(header_data[0], tuple) else b''
                    header_msg = email.message_from_bytes(header_bytes)
                except Exception:
                    continue

                source_message_id = header_msg.get("Message-ID", "")
                raw_subject = header_msg.get("Subject", "")
                if raw_subject:
                    decoded = decode_header(raw_subject)[0][0]
                    subject = decoded.decode(errors='ignore') if isinstance(decoded, bytes) else str(decoded)
                else:
                    subject = ""
                header_from = header_msg.get("From", "")

                # Fast dedup: check if this email was already processed by the scanner
                email_key = source_message_id or f"uid:{folder_name}:{uid.decode()}"
                if email_key in seen_keys:
                    skipped_count += 1
                    continue

                # In full_scan mode, ONLY skip if message was deleted (tombstone)
                if full_scan:
                    if source_message_id and source_message_id in tombstones:
                        log(f"[INBOX][TOMBSTONE] Message {source_message_id} was previously deleted, skipping")
                        skipped_count += 1
                        continue
                else:
                    if is_invoice_already_processed(subject, invoice_numbers, message_ids, tombstones, source_message_id):
                        skipped_count += 1
                        continue

                # Passed dedup — now do the full fetch to get attachments
                status, msg_data = mail.uid('fetch', uid, '(RFC822)')
                if status != 'OK':
                    continue
                msg = email.message_from_bytes(msg_data[0][1])

                # Re-extract subject from full message (more reliable than header-only parse)
                full_subject = decode_header(msg["Subject"])[0][0]
                if isinstance(full_subject, bytes):
                    full_subject = full_subject.decode(errors='ignore')
                subject = full_subject or subject

                # VENDOR FILTER: Only process emails from active vendors
                if not is_email_from_active_vendor(msg, subject):
                    skipped_count += 1
                    continue

                if full_scan:
                    log(f"[INBOX][SCAN][FULL] Processing email in full scan mode: {subject}")

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

                if has_pdf:
                    log(f"[INBOX][SCAN][{folder_name}] Processing invoice email: {subject}")
                    pdf_files = extract_and_save_pdfs(msg, subject, source_message_id)
                    for filepath, detected_vendor, email_context in pdf_files:
                        pdf_tasks.append((filepath, detected_vendor, email_context))
                    if pdf_files:
                        if not full_scan:
                            move_to_processed(mail, uid)
                        mark_email_seen(email_key)
                        seen_keys.add(email_key)
                        processed_count += 1
                    else:
                        log(f"[INBOX][SCAN][WARNING] Email had PDF flag but no PDFs extracted: {subject}")
                        skipped_count += 1
                else:
                    sender = msg.get("From", "unknown")
                    log(f"[INBOX][SCAN][NO_PDF][{folder_name}] Skipping email without PDF - From: {sender}, Subject: {subject}")
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

        # Second pass: process PDFs in parallel with PCS AI classification
        processed_pdfs = 0
        failed_pdfs = 0
        if pdf_tasks:
            log(f"[INBOX][PARALLEL] Processing {len(pdf_tasks)} PDFs with PCS AI classification and thread pool")
            with ThreadPoolExecutor(max_workers=3) as executor:  # Reduced workers to avoid API rate limits
                futures = [executor.submit(process_pdf_file, filepath, vendor, email_ctx) for filepath, vendor, email_ctx in pdf_tasks]
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
        log(f"[INBOX][SCAN][END] Processed {processed_pdfs} invoices, skipped {skipped_count} (no PDF: {no_pdf_count}), duration {duration_ms}ms")

        # Update last scan result - use processed_pdfs (actual invoices added) not processed_count (emails with PDFs)
        _last_scan_result = {
            "timestamp": datetime.now().isoformat(),
            "added": processed_pdfs,
            "skipped": skipped_count,
            "duration_ms": duration_ms,
            "error": None,
        }

        # Reset backoff on success
        _config["backoff_seconds"] = 10
        _config["last_error_time"] = None

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        log(f"[INBOX][SCAN][ERROR] Exception in inbox check: {e}")
        import traceback
        log(f"[INBOX][SCAN][TRACEBACK] {traceback.format_exc()}")
        _last_scan_result = {
            "timestamp": datetime.now().isoformat(),
            "added": 0,
            "skipped": 0,
            "duration_ms": duration_ms,
            "error": str(e),
        }

        now = time.time()
        _config["last_error_time"] = now

        # Increase backoff on error, but auto-reset if last error was >15 min ago
        prev_error_time = _config.get("last_error_time")
        if prev_error_time and (now - prev_error_time) > 900:
            log("[INBOX][SCAN][BACKOFF] Last error was >15min ago, resetting backoff")
            _config["backoff_seconds"] = 10
        else:
            _config["backoff_seconds"] = min(
                _config["backoff_seconds"] * 2,
                _config["max_backoff_seconds"]
            )
        log(f"[INBOX][SCAN][BACKOFF] Backoff now {_config['backoff_seconds']}s")

    finally:
        # Write heartbeat regardless of success/failure
        write_heartbeat(
            status="ok" if not _last_scan_result.get("error") else "error",
            error=_last_scan_result.get("error"),
        )

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
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Email ingestion agent with PCS AI for classification and parsing'
    )
    parser.add_argument(
        '--full-scan', 
        action='store_true',
        help='Run one-time full scan of ALL emails in inbox (processes all emails, skips only tombstoned)'
    )
    parser.add_argument(
        '--once', 
        action='store_true',
        help='Run once and exit (no continuous loop). Without --full-scan, processes only new emails.'
    )
    args = parser.parse_args()
    
    log(f"[INBOX][WATCHER][CONFIG] PCS_DATA_DIR={DATA_DIR}")
    log(f"[INBOX][WATCHER][CONFIG] IMAP_SERVER={IMAP_SERVER}")
    log(f"[INBOX][WATCHER][CONFIG] IMAP_USER={EMAIL_USER}")
    log(f"[INBOX][WATCHER][CONFIG] API_BASE_URL={API_BASE_URL}")
    log(f"[INBOX][WATCHER][CONFIG] FOLDERS=INBOX + {EXTRA_FOLDERS}")
    log(f"[INBOX][WATCHER][CONFIG] HEARTBEAT_PATH={HEARTBEAT_PATH}")
    
    if args.full_scan:
        # One-time full scan mode - process ALL emails
        log("[INBOX][WATCHER][MODE] Running ONE-TIME FULL SCAN of all emails")
        log("[INBOX][WATCHER][MODE] This will process ALL emails in inbox, skipping only tombstoned ones")
        log("[INBOX][WATCHER][MODE] Duplicates will be detected and skipped by the PCS AI ingest API")
        check_inbox(full_scan=True)
        log("[INBOX][WATCHER][MODE] Full scan complete. Exiting.")
    elif args.once:
        # Run once mode - process only new emails, then exit
        log("[INBOX][WATCHER][MODE] Running ONCE mode - processing new emails only")
        check_inbox(full_scan=False)
        log("[INBOX][WATCHER][MODE] Single run complete. Exiting.")
    else:
        # Continuous watcher mode (default)
        # Try IMAP IDLE for near-instant push notifications; fall back to polling
        interval_ms = _config["interval_ms"]
        log(f"[INBOX][WATCHER][START] Starting continuous inbox watcher (polling fallback: {interval_ms}ms)")

        def _check_idle_support():
            """Check if the IMAP server advertises IDLE capability."""
            try:
                test_mail = connect_imap()
                caps = test_mail.capabilities
                test_mail.logout()
                # capabilities can be bytes or str depending on imaplib version
                cap_strs = {(c.decode() if isinstance(c, bytes) else c).upper() for c in caps}
                has_idle = 'IDLE' in cap_strs
                log(f"[IMAP][IDLE] Server capabilities: {cap_strs}")
                log(f"[IMAP][IDLE] IDLE supported: {has_idle}")
                return has_idle
            except Exception as e:
                log(f"[IMAP][IDLE] Could not check capabilities: {e}")
                return False

        def _run_idle_loop():
            """Use IMAP IDLE to wait for new mail instead of polling.
            
            Keeps a persistent IMAP connection and uses the IDLE command
            to receive near-instant push notifications when new mail arrives.
            Falls back to reconnecting on any connection error.
            """
            IDLE_TIMEOUT = 300  # Re-issue IDLE every 5 min (RFC recommends <29 min)
            consecutive_errors = 0
            idle_seq = [0]  # Mutable counter for generating unique IMAP tags

            while True:
                idle_mail = None
                try:
                    idle_mail = connect_imap()
                    idle_mail.select('INBOX')
                    consecutive_errors = 0

                    while True:
                        # Send IDLE command using raw socket for reliability
                        idle_seq[0] += 1
                        tag = f'IDLE{idle_seq[0]}'.encode()
                        idle_mail.send(tag + b' IDLE\r\n')

                        # Read the continuation response ("+ idling" or similar)
                        sock = idle_mail.socket()
                        sock.settimeout(30)
                        try:
                            continuation = b''
                            while b'\r\n' not in continuation:
                                chunk = sock.recv(4096)
                                if not chunk:
                                    raise ConnectionError("IMAP connection closed during IDLE handshake")
                                continuation += chunk
                        except Exception as e:
                            log(f"[IMAP][IDLE] Failed to enter IDLE mode: {e}")
                            break

                        if not continuation.startswith(b'+'):
                            log(f"[IMAP][IDLE] Unexpected IDLE response: {continuation[:100]}")
                            break

                        # Now wait for server push (EXISTS = new mail) or timeout
                        sock.settimeout(None)
                        readable, _, _ = select.select([sock], [], [], IDLE_TIMEOUT)

                        got_new_mail = False
                        if readable:
                            try:
                                data = sock.recv(8192)
                                if not data:
                                    raise ConnectionError("IMAP connection closed")
                                got_new_mail = b'EXISTS' in data
                                if got_new_mail:
                                    log("[IMAP][IDLE] New mail detected via IDLE push")
                                else:
                                    log("[IMAP][IDLE] Server event (non-EXISTS)")
                            except Exception as e:
                                log(f"[IMAP][IDLE] Error reading IDLE data: {e}")
                                break

                        # Send DONE to end IDLE
                        idle_mail.send(b'DONE\r\n')
                        # Read the tagged OK response
                        sock.settimeout(30)
                        try:
                            response = b''
                            while tag not in response:
                                chunk = sock.recv(4096)
                                if not chunk:
                                    break
                                response += chunk
                        except Exception:
                            pass
                        sock.settimeout(None)

                        if got_new_mail:
                            # Disconnect IDLE connection and run the full scan pipeline
                            try:
                                idle_mail.logout()
                            except Exception:
                                pass
                            idle_mail = None
                            check_inbox(full_scan=False)
                            # Reconnect for next IDLE cycle
                            idle_mail = connect_imap()
                            idle_mail.select('INBOX')
                        else:
                            write_heartbeat(status="ok")

                except imaplib.IMAP4.abort:
                    log("[IMAP][IDLE] Connection aborted, reconnecting...")
                    consecutive_errors += 1
                except (ConnectionError, OSError, TimeoutError) as e:
                    log(f"[IMAP][IDLE] Connection error: {e}")
                    consecutive_errors += 1
                except Exception as e:
                    log(f"[IMAP][IDLE] Error in IDLE loop: {e}")
                    consecutive_errors += 1
                finally:
                    try:
                        if idle_mail:
                            idle_mail.logout()
                    except Exception:
                        pass

                backoff = min(10 * (2 ** min(consecutive_errors, 5)), 300)
                log(f"[IMAP][IDLE] Reconnecting in {backoff}s (errors: {consecutive_errors})")
                time.sleep(backoff)

        def _run_poll_loop():
            """Original polling loop as fallback."""
            while True:
                check_inbox(full_scan=False)

                base_interval_s = _config["interval_ms"] / 1000.0
                if _config["backoff_seconds"] > 10:
                    base_interval_s = _config["backoff_seconds"]
                    log(f"[INBOX][WATCHER][BACKOFF] Using backoff interval: {base_interval_s}s")

                jitter = random.uniform(-0.15, 0.15)
                sleep_time = base_interval_s * (1 + jitter)
                log(f"[INBOX][WATCHER][SLEEP] Sleeping for {sleep_time:.1f}s (base: {base_interval_s}s, jitter: {jitter*100:.1f}%)")
                time.sleep(sleep_time)

        # Do an initial scan immediately, then decide IDLE vs polling
        check_inbox(full_scan=False)

        if _check_idle_support():
            log("[INBOX][WATCHER][MODE] Using IMAP IDLE (push notifications)")
            try:
                _run_idle_loop()
            except KeyboardInterrupt:
                log("[INBOX][WATCHER][STOP] Interrupted")
            except Exception as e:
                log(f"[IMAP][IDLE] IDLE loop crashed, falling back to polling: {e}")
                _run_poll_loop()
        else:
            log("[INBOX][WATCHER][MODE] IDLE not supported, using polling")
            _run_poll_loop()
