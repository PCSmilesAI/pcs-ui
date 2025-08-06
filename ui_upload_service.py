#!/usr/bin/env python3
"""
UI Upload Service - Monitors invoice queue and uploads to PCS AI UI
"""

import os
import json
import time
from datetime import datetime

# Configuration
INVOICE_QUEUE_PATH = os.path.join(os.path.dirname(__file__), "invoice_queue.json")
OUTPUT_JSONS_PATH = os.path.join(os.path.dirname(__file__), "output_jsons")
EMAIL_INVOICES_PATH = os.path.join(os.path.dirname(__file__), "email_invoices")
LOG_PATH = os.path.join(os.path.dirname(__file__), "ui_upload.log")

# UI Configuration (adjust as needed)
UI_BASE_URL = "http://localhost:5173"  # Vite dev server
API_ENDPOINT = "/api/invoices"

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

def mark_invoice_uploaded(invoice_number):
    """Mark invoice as uploaded in queue"""
    queue = load_invoice_queue()
    for invoice in queue:
        if invoice.get('invoice_number') == invoice_number:
            invoice['status'] = 'uploaded'
            invoice['uploaded_at'] = datetime.now().isoformat()
            break
    
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(queue, f, indent=2)

def upload_invoice_to_ui(invoice_data):
    """Upload invoice data to PCS AI UI"""
    try:
        # Load parsed JSON data
        json_file_path = invoice_data['json_path']
        if not os.path.exists(json_file_path):
            log(f"❌ JSON file not found: {json_file_path}")
            return False
        
        with open(json_file_path, 'r') as f:
            parsed_data = json.load(f)
        
        # Load PDF file
        pdf_file_path = invoice_data['pdf_path']
        if not os.path.exists(pdf_file_path):
            log(f"❌ PDF file not found: {pdf_file_path}")
            return False
        
        # Prepare upload payload
        payload = {
            "invoice_number": invoice_data['invoice_number'],
            "invoice_date": invoice_data['invoice_date'],
            "vendor": invoice_data['vendor'],
            "clinic_id": invoice_data['clinic_id'],
            "total": invoice_data['total'],
            "parsed_data": parsed_data,
            "pdf_filename": os.path.basename(pdf_file_path),
            "status": "new",
            "timestamp": invoice_data['timestamp'],
            "assigned_to": None,
            "approved": False
        }
        
        # Upload to UI (this would need to be implemented in the UI)
        # For now, we'll simulate the upload
        log(f"📤 Uploading invoice {invoice_data['invoice_number']} to UI")
        log(f"📊 Vendor: {invoice_data['vendor']}")
        log(f"📄 PDF: {os.path.basename(pdf_file_path)}")
        log(f"📋 JSON: {os.path.basename(json_file_path)}")
        log(f"💰 Total: ${invoice_data['total']}")
        log(f"🏥 Clinic: {invoice_data['clinic_id']}")
        
        # Mark as uploaded
        mark_invoice_uploaded(invoice_data['invoice_number'])
        log(f"✅ Invoice {invoice_data['invoice_number']} uploaded successfully")
        
        return True
        
    except Exception as e:
        log(f"❌ Upload failed for {invoice_data.get('invoice_number', 'Unknown')}: {e}")
        return False

def process_new_invoices():
    """Process new invoices in the queue"""
    queue = load_invoice_queue()
    new_invoices = [inv for inv in queue if inv.get('status') == 'new']
    
    if not new_invoices:
        return
    
    log(f"📋 Found {len(new_invoices)} new invoices to upload")
    
    for invoice in new_invoices:
        success = upload_invoice_to_ui(invoice)
        if success:
            log(f"✅ Successfully uploaded invoice {invoice['invoice_number']}")
        else:
            log(f"❌ Failed to upload invoice {invoice['invoice_number']}")
        
        # Small delay between uploads
        time.sleep(1)

def main():
    """Main function"""
    log("🚀 Starting UI Upload Service")
    log("=" * 50)
    
    # Process any existing new invoices
    process_new_invoices()
    
    # Monitor queue for changes
    last_modified = 0
    while True:
        try:
            # Check if queue file has been modified
            if os.path.exists(INVOICE_QUEUE_PATH):
                current_modified = os.path.getmtime(INVOICE_QUEUE_PATH)
                if current_modified > last_modified:
                    log("📋 Queue file modified, processing new invoices")
                    process_new_invoices()
                    last_modified = current_modified
            
            # Wait before checking again
            time.sleep(5)
            
        except KeyboardInterrupt:
            log("🛑 UI Upload Service stopped by user")
            break
        except Exception as e:
            log(f"❌ Error in main loop: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main() 