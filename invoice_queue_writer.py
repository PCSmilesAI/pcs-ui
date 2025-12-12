#!/usr/bin/env python3
"""
Invoice Queue Writer - Monitors output_jsons directory and ingests invoices to database
"""

import os
import json
import time
import glob
import requests
from datetime import datetime
from deleted_invoice_guard import compute_file_hash, should_skip_deleted_invoice
from filename_utils import sanitize_filename, api_pdf_path

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

# Ensure core directories exist
OUTPUT_JSONS_PATH = os.path.join(DATA_DIR, "output_jsons")
EMAIL_INVOICES_PATH = os.path.join(DATA_DIR, "email_invoices")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(OUTPUT_JSONS_PATH, exist_ok=True)
os.makedirs(EMAIL_INVOICES_PATH, exist_ok=True)

INVOICE_QUEUE_PATH = os.path.join(DATA_DIR, "invoice_queue.json")
LOG_PATH = os.path.join(DATA_DIR, "queue_writer.log")

# API endpoint for ingesting invoices
API_BASE_URL = os.environ.get('PCS_API_URL', 'http://localhost:3000')
INGEST_ENDPOINT = f"{API_BASE_URL}/api/invoices/ingest"

def log(msg):
    """Log messages with timestamp"""
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def load_invoice_queue():
    """Load invoice queue from file"""
    if os.path.exists(INVOICE_QUEUE_PATH):
        with open(INVOICE_QUEUE_PATH, 'r') as f:
            return json.load(f)
    return []

def save_invoice_queue(queue):
    """Save invoice queue to file"""
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(queue, f, indent=2)

def find_corresponding_pdf(json_filename):
    """Find the PDF file that corresponds to a JSON file and return (fs_path, api_path)."""
    base_name = json_filename.replace('.json', '')

    candidates = []
    # Prefer the sanitized version of the base name
    sanitized_pdf = sanitize_filename(base_name + '.pdf')
    candidates.append(os.path.join(EMAIL_INVOICES_PATH, sanitized_pdf))
    candidates.append(os.path.join(EMAIL_INVOICES_PATH, base_name + '.pdf'))

    # Fallback: look for PDFs that contain the base name
    try:
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if pdf_file.lower().endswith('.pdf') and base_name in pdf_file:
                candidates.append(os.path.join(EMAIL_INVOICES_PATH, pdf_file))
    except FileNotFoundError:
        pass

    for candidate in candidates:
        if os.path.exists(candidate):
            pdf_basename = os.path.basename(candidate)
            return candidate, api_pdf_path(pdf_basename)

    # If still no match, return the expected sanitized path (for debugging)
    fallback = os.path.join(EMAIL_INVOICES_PATH, sanitized_pdf)
    return fallback, api_pdf_path(os.path.basename(fallback))

def detect_vendor_from_filename(filename):
    """Detect vendor from filename - improved to avoid false positives"""
    filename_lower = filename.lower()
    
    # Order matters - check more specific patterns first
    if 'henry' in filename_lower or 'henryschein' in filename_lower:
        return 'Henry Schein'
    elif 'patterson' in filename_lower:
        return 'Patterson Dental'
    elif 'epic' in filename_lower and 'dental' in filename_lower:
        return 'Epic Dental Lab'
    elif 'darby' in filename_lower:
        return 'Darby Dental'
    elif 'dandy' in filename_lower:
        return 'Dandy'
    elif 'exodus' in filename_lower:
        return 'Exodus'
    elif 'artisan' in filename_lower:
        return 'Artisan Dental'
    elif 'brasseler' in filename_lower:
        return 'Brasseler USA'
    elif 'ctr' in filename_lower and 'services' in filename_lower:
        return 'CTR Services'
    elif 'a-1' in filename_lower or 'a1_professional' in filename_lower:
        return 'A-1 Professional'
    elif 'comcast' in filename_lower:
        return 'Comcast'
    elif 'bridgeford' in filename_lower or 'bfv' in filename_lower:
        return 'Bridgeford'
    elif 'waterco' in filename_lower:
        return 'WaterCo'
    elif 'crest' in filename_lower or 'oral-b' in filename_lower:
        return 'Crest & Oral-B'
    elif 'staffing' in filename_lower and 'dental' in filename_lower:
        return 'Dental Medical Staffing'
    # TC Dental must be very specific to avoid false positives
    elif 'tc dental' in filename_lower or 'tc_dental' in filename_lower:
        return 'TC Dental'
    else:
        return 'Unknown'  # Changed from 'tc' to 'Unknown'

def add_invoice_to_queue(json_file_path):
    """Ingest invoice to database via API"""
    try:
        # Load the JSON file to get invoice data
        with open(json_file_path, 'r') as f:
            invoice_data = json.load(f)

        # Extract invoice information
        invoice_number = invoice_data.get('invoice_number', '')
        vendor = invoice_data.get('vendor', '')
        total = invoice_data.get('total', '') or invoice_data.get('invoice_total', '')
        office_location = invoice_data.get('office_location', '')
        invoice_date = invoice_data.get('invoice_date', '')

        # Normalize vendor name - map all variations to standard names
        vendor_lower = vendor.lower().strip()
        vendor_map = {
            'henry schein': 'Henry Schein',
            'henry': 'Henry Schein',
            'henryschein': 'Henry Schein',
            'epic dental lab': 'Epic Dental Lab',
            'epic': 'Epic Dental Lab',
            'patterson': 'Patterson Dental',
            'patterson dental': 'Patterson Dental',
            'tc dental': 'TC Dental',
            'tc': 'TC Dental',
            'tc dental laboratory': 'TC Dental',
            'darby': 'Darby Dental',
            'darby dental': 'Darby Dental',
            'dandy': 'Dandy',
            'exodus': 'Exodus',
            'exodus dental': 'Exodus',
            'artisan': 'Artisan Dental',
            'artisan dental': 'Artisan Dental',
            'brasseler': 'Brasseler USA',
            'brasseler usa': 'Brasseler USA',
            'ctr services': 'CTR Services',
            'ctr': 'CTR Services',
            'a-1 professional': 'A-1 Professional',
            'a1 professional': 'A-1 Professional',
            'comcast': 'Comcast',
            'bridgeford': 'Bridgeford',
            'waterco': 'WaterCo',
            'crest': 'Crest & Oral-B',
            'oral-b': 'Crest & Oral-B',
            'unknown': 'Unknown',
            '': 'Unknown',
        }
        vendor = vendor_map.get(vendor_lower, vendor or 'Unknown')

        # Find the correct PDF path
        json_filename = os.path.basename(json_file_path)
        pdf_fs_path, pdf_api_path = find_corresponding_pdf(json_filename)

        file_hash = compute_file_hash(pdf_fs_path)
        skip_deleted, skip_reason = should_skip_deleted_invoice(
            vendor=vendor,
            invoice_number=invoice_number,
            pdf_path=pdf_fs_path,
            file_hash=file_hash,
            source_file=invoice_data.get('source_file') or json_filename,
        )
        if skip_deleted:
            log(f"⏭️ Skipped deleted invoice ({skip_reason}): vendor={vendor} invoice={invoice_number}")
            return False

        # Prepare payload for API
        payload = {
            "invoice_number": invoice_number,
            "vendor": vendor,
            "total": total,
            "office_location": office_location,
            "invoice_date": invoice_date,
            "clinic_id": office_location,
            "source_file": invoice_data.get('source_file') or json_filename,
            "json_path": json_file_path,
            "pdf_path": pdf_api_path,
            "pdf_fs_path": pdf_fs_path,
        }

        # Call API to ingest invoice
        try:
            response = requests.post(INGEST_ENDPOINT, json=payload, timeout=10)
            if response.status_code in [200, 201]:
                result = response.json()
                log(f"✅ Ingested invoice {invoice_number} to database")
                log(f"📊 Vendor: {vendor}")
                log(f"💰 Total: ${total}")
                log(f"🏥 Clinic: {office_location}")
                return True
            else:
                log(f"⚠️ API error ingesting {invoice_number}: {response.status_code} {response.text}")
                return False
        except requests.exceptions.RequestException as e:
            log(f"⚠️ Failed to reach API at {INGEST_ENDPOINT}: {e}")
            log(f"   Falling back to queue file for {invoice_number}")
            # Fallback: write to queue file if API is unavailable
            return add_invoice_to_queue_file(json_file_path, payload)

    except Exception as e:
        log(f"❌ Error ingesting invoice: {e}")
        return False

def add_invoice_to_queue_file(json_file_path, payload):
    """Fallback: Add invoice to queue file if API is unavailable"""
    try:
        queue_entry = {
            "invoice_number": payload.get('invoice_number'),
            "invoice_date": payload.get('invoice_date'),
            "vendor": payload.get('vendor'),
            "clinic_id": payload.get('clinic_id'),
            "total": payload.get('total'),
            "status": "new",
            "json_path": json_file_path,
            "pdf_path": payload.get('pdf_path'),
            "pdf_fs_path": payload.get('pdf_fs_path'),
            "timestamp": datetime.now().isoformat(),
            "assigned_to": None,
            "approved": False,
            "source_file": payload.get('source_file'),
        }

        # Load current queue
        queue = load_invoice_queue()

        # Check if invoice already exists
        existing_invoices = [inv for inv in queue if inv.get('invoice_number') == payload.get('invoice_number')]
        if existing_invoices:
            log(f"⚠️ Invoice {payload.get('invoice_number')} already in queue, skipping")
            return False

        # Add to queue
        queue.append(queue_entry)
        save_invoice_queue(queue)

        log(f"✅ Added invoice {payload.get('invoice_number')} to queue file (fallback)")
        return True
    except Exception as e:
        log(f"❌ Error adding to queue file: {e}")
        return False

def process_new_json_files():
    """Process new JSON files in output_jsons directory"""
    if not os.path.exists(OUTPUT_JSONS_PATH):
        log(f"❌ Output directory not found: {OUTPUT_JSONS_PATH}")
        return

    # Get all JSON files
    json_files = glob.glob(os.path.join(OUTPUT_JSONS_PATH, "*.json"))

    # Load current queue to check what's already processed (fallback)
    queue = load_invoice_queue()
    processed_files = {entry.get('json_path') for entry in queue}

    # Process new files
    new_files = [f for f in json_files if f not in processed_files]

    if new_files:
        log(f"📄 Found {len(new_files)} new JSON files to process")
        for json_file in new_files:
            # Try to ingest via API (with fallback to queue file)
            add_invoice_to_queue(json_file)
    else:
        log("📄 No new JSON files found")

def main():
    """Main function"""
    log("🚀 Starting Invoice Queue Writer")
    log("=" * 50)
    
    # Create directories if they don't exist
    os.makedirs(OUTPUT_JSONS_PATH, exist_ok=True)
    os.makedirs(EMAIL_INVOICES_PATH, exist_ok=True)
    
    # Process any existing JSON files
    process_new_json_files()
    
    # Monitor for new files
    last_check = 0
    while True:
        try:
            # Check for new files every 10 seconds
            current_time = time.time()
            if current_time - last_check >= 10:
                process_new_json_files()
                last_check = current_time
            
            time.sleep(5)
            
        except KeyboardInterrupt:
            log("🛑 Invoice Queue Writer stopped by user")
            break
        except Exception as e:
            log(f"❌ Error in main loop: {e}")
            time.sleep(10)

if __name__ == "__main__":
    import sys

    # Support command-line arguments for direct invocation
    if len(sys.argv) > 1:
        # Called with arguments: invoice_queue_writer.py <json_path_or_pdf_path> [vendor]
        input_path = sys.argv[1]
        vendor = sys.argv[2] if len(sys.argv) > 2 else None

        # Check if input is a JSON file or PDF file
        if input_path.endswith('.json'):
            # Direct JSON file path
            if os.path.exists(input_path):
                add_invoice_to_queue(input_path)
                sys.exit(0)
            else:
                log(f"❌ JSON file not found: {input_path}")
                sys.exit(1)
        elif input_path.endswith('.pdf') or input_path.endswith('.PDF'):
            # PDF file path - find corresponding JSON
            if os.path.exists(input_path):
                pdf_basename = os.path.basename(input_path)
                json_basename = pdf_basename.replace('.pdf', '.json').replace('.PDF', '.json')
                json_path = os.path.join(OUTPUT_JSONS_PATH, json_basename)

                # If JSON doesn't exist yet, wait a moment for it to be created
                if not os.path.exists(json_path):
                    time.sleep(1)

                if os.path.exists(json_path):
                    add_invoice_to_queue(json_path)
                    sys.exit(0)
                else:
                    log(f"❌ JSON file not found for {pdf_basename}")
                    sys.exit(1)
            else:
                log(f"❌ PDF file not found: {input_path}")
                sys.exit(1)
        else:
            log(f"❌ Invalid file type: {input_path}")
            sys.exit(1)
    else:
        # Run as daemon
        main()
