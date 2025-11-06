#!/usr/bin/env python3
"""
Process existing PDFs in email_invoices folder and add them to invoice queue
"""

import os
import sys
import subprocess
import json
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
EMAIL_INVOICES_PATH = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
OUTPUT_JSONS_PATH = os.path.join(BASE_DIR, "output_jsons")
INVOICE_QUEUE_PATH = os.path.join(BASE_DIR, "pcs_ai_data", "invoice_queue.json")

def log(msg):
    """Log messages with timestamp"""
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}")

def load_invoice_queue():
    """Load invoice queue from file"""
    if os.path.exists(INVOICE_QUEUE_PATH):
        with open(INVOICE_QUEUE_PATH, 'r') as f:
            return json.load(f)
    return []

def get_processed_pdfs():
    """Get list of PDFs already in the invoice queue"""
    queue = load_invoice_queue()
    processed = set()
    for inv in queue:
        pdf_path = inv.get('pdf_path', '')
        if pdf_path:
            processed.add(os.path.basename(pdf_path))
    return processed

def process_pdf(pdf_path):
    """Process a single PDF through vendor_router"""
    try:
        result = subprocess.run(
            ["python3", VENDOR_ROUTER_PATH, pdf_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            vendor = result.stdout.strip()
            log(f"✅ Processed {os.path.basename(pdf_path)}: {vendor}")
            return True
        else:
            log(f"❌ Failed to process {os.path.basename(pdf_path)}")
            return False
    except subprocess.TimeoutExpired:
        log(f"⏰ Timeout processing {os.path.basename(pdf_path)}")
        return False
    except Exception as e:
        log(f"❌ Error processing {os.path.basename(pdf_path)}: {e}")
        return False

def main():
    """Main function"""
    log("🚀 Starting PDF processor")
    log(f"📁 Email invoices folder: {EMAIL_INVOICES_PATH}")
    
    if not os.path.exists(EMAIL_INVOICES_PATH):
        log(f"❌ Email invoices folder not found: {EMAIL_INVOICES_PATH}")
        sys.exit(1)
    
    # Get list of PDFs already processed
    processed_pdfs = get_processed_pdfs()
    log(f"📊 Found {len(processed_pdfs)} invoices already in queue")
    
    # Get list of all PDFs in email_invoices folder
    all_pdfs = [f for f in os.listdir(EMAIL_INVOICES_PATH) if f.lower().endswith('.pdf')]
    log(f"📁 Found {len(all_pdfs)} PDFs in email_invoices folder")
    
    # Process PDFs that are not yet in the queue
    to_process = [f for f in all_pdfs if f not in processed_pdfs]
    log(f"⏳ Processing {len(to_process)} new PDFs")
    
    processed_count = 0
    failed_count = 0
    
    for i, pdf_filename in enumerate(to_process, 1):
        pdf_path = os.path.join(EMAIL_INVOICES_PATH, pdf_filename)
        log(f"[{i}/{len(to_process)}] Processing {pdf_filename}")
        
        if process_pdf(pdf_path):
            processed_count += 1
        else:
            failed_count += 1
    
    log(f"✅ Completed! Processed: {processed_count}, Failed: {failed_count}")

if __name__ == "__main__":
    main()

