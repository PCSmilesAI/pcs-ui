#!/usr/bin/env python3
"""
Invoice Queue Writer - Monitors output_jsons directory and adds new invoices to queue
"""

import os
import json
import time
import glob
from datetime import datetime

# Configuration
OUTPUT_JSONS_PATH = os.path.join(os.path.dirname(__file__), "output_jsons")
INVOICE_QUEUE_PATH = os.path.join(os.path.dirname(__file__), "invoice_queue.json")
EMAIL_INVOICES_PATH = os.path.join(os.path.dirname(__file__), "email_invoices")
LOG_PATH = os.path.join(os.path.dirname(__file__), "queue_writer.log")

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

def detect_vendor_from_filename(filename):
    """Detect vendor from filename"""
    filename_lower = filename.lower()
    
    if 'henry' in filename_lower or 'henryschein' in filename_lower:
        return 'henry'
    elif 'epic' in filename_lower:
        return 'epic'
    elif 'patterson' in filename_lower:
        return 'patterson'
    elif 'exodus' in filename_lower:
        return 'exodus'
    elif 'artisan' in filename_lower:
        return 'artisan'
    elif 'tc' in filename_lower:
        return 'tc'
    else:
        return 'unknown'

def add_invoice_to_queue(json_file_path):
    """Add invoice to queue"""
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
        
        # Normalize vendor name
        if vendor.lower() in ['henry schein', 'henry schein']:
            vendor = 'Henry Schein'
        elif vendor.lower() == 'epic dental lab':
            vendor = 'Epic Dental Lab'
        
        # Create PDF path
        json_filename = os.path.basename(json_file_path)
        pdf_filename = json_filename.replace('.json', '.pdf')
        pdf_path = os.path.join(EMAIL_INVOICES_PATH, pdf_filename)
        
        # Create queue entry
        queue_entry = {
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "vendor": vendor,
            "clinic_id": office_location,
            "total": total,
            "status": "new",
            "json_path": json_file_path,
            "pdf_path": pdf_path,
            "timestamp": datetime.now().isoformat(),
            "assigned_to": None,
            "approved": False
        }
        
        # Load current queue
        queue = load_invoice_queue()
        
        # Check if invoice already exists
        existing_invoices = [inv for inv in queue if inv.get('invoice_number') == invoice_number]
        if existing_invoices:
            log(f"⚠️ Invoice {invoice_number} already in queue, skipping")
            return False
        
        # Add to queue
        queue.append(queue_entry)
        save_invoice_queue(queue)
        
        log(f"✅ Added invoice {invoice_number} to queue")
        log(f"📊 Vendor: {vendor}")
        log(f"💰 Total: ${total}")
        log(f"🏥 Clinic: {office_location}")
        
        return True
        
    except Exception as e:
        log(f"❌ Error adding invoice to queue: {e}")
        return False

def process_new_json_files():
    """Process new JSON files in output_jsons directory"""
    if not os.path.exists(OUTPUT_JSONS_PATH):
        log(f"❌ Output directory not found: {OUTPUT_JSONS_PATH}")
        return
    
    # Get all JSON files
    json_files = glob.glob(os.path.join(OUTPUT_JSONS_PATH, "*.json"))
    
    # Load current queue to check what's already processed
    queue = load_invoice_queue()
    processed_files = {entry.get('json_path') for entry in queue}
    
    # Process new files
    new_files = [f for f in json_files if f not in processed_files]
    
    if new_files:
        log(f"📄 Found {len(new_files)} new JSON files to process")
        for json_file in new_files:
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
    main()
