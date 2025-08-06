#!/usr/bin/env python3
"""
Queue Field Normalizer
Reads the current invoice_queue.json and normalizes entries to match PCS AI UI format.
"""

import os
import json
import glob
from datetime import datetime

def load_json_file(filepath):
    """Load and parse a JSON file"""
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None

def normalize_queue_entry(entry, invoice_data):
    """Normalize a queue entry to match PCS AI UI format"""
    
    # Extract fields from invoice data
    invoice_number = invoice_data.get('invoice_number', '')
    invoice_date = invoice_data.get('invoice_date', '')
    vendor = invoice_data.get('vendor', '')
    vendor_name = invoice_data.get('vendor_name', '')
    total = invoice_data.get('total', '') or invoice_data.get('invoice_total', '')
    office_location = invoice_data.get('office_location', '')
    
    # Normalize vendor name
    if vendor.lower() == 'henry schein' or vendor.lower() == 'henry schein':
        vendor = 'Henry Schein'
    elif vendor.lower() == 'epic dental lab':
        vendor = 'Epic Dental Lab'
    
    # Create normalized entry
    normalized_entry = {
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "vendor": vendor,
        "clinic_id": office_location,
        "total": total,
        "status": "new",
        "json_path": entry.get('json_file', ''),
        "pdf_path": entry.get('pdf_file', ''),
        "timestamp": entry.get('timestamp', datetime.now().isoformat()),
        "assigned_to": entry.get('assigned_to'),
        "approved": entry.get('approved', False)
    }
    
    return normalized_entry

def normalize_invoice_queue():
    """Normalize the entire invoice queue"""
    
    # Load current queue
    queue_file = "invoice_queue.json"
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    with open(queue_file, 'r') as f:
        current_queue = json.load(f)
    
    print(f"📋 Found {len(current_queue)} entries in current queue")
    
    # Normalize each entry
    normalized_queue = []
    processed_count = 0
    skipped_count = 0
    
    for entry in current_queue:
        json_file = entry.get('json_file')
        
        if not json_file or not os.path.exists(json_file):
            print(f"⚠️ Skipping entry - JSON file not found: {json_file}")
            skipped_count += 1
            continue
        
        # Load invoice data from JSON file
        invoice_data = load_json_file(json_file)
        if not invoice_data:
            print(f"⚠️ Skipping entry - invalid JSON: {json_file}")
            skipped_count += 1
            continue
        
        # Normalize the entry
        normalized_entry = normalize_queue_entry(entry, invoice_data)
        normalized_queue.append(normalized_entry)
        processed_count += 1
        
        print(f"✅ Normalized: {invoice_data.get('vendor', 'Unknown')} - {invoice_data.get('invoice_number', 'No Number')}")
    
    # Save normalized queue
    with open(queue_file, 'w') as f:
        json.dump(normalized_queue, f, indent=2)
    
    print("=" * 50)
    print(f"📊 NORMALIZATION COMPLETE")
    print(f"✅ Processed: {processed_count} entries")
    print(f"⚠️ Skipped: {skipped_count} entries")
    print(f"📋 Total entries: {len(normalized_queue)}")
    print("=" * 50)
    
    # Show sample of normalized entries
    if normalized_queue:
        print("\n📄 Sample normalized entries:")
        for i, entry in enumerate(normalized_queue[:3]):
            print(f"\nEntry {i+1}:")
            print(f"  Invoice: {entry.get('invoice_number', 'N/A')}")
            print(f"  Vendor: {entry.get('vendor', 'N/A')}")
            print(f"  Total: ${entry.get('total', 'N/A')}")
            print(f"  Clinic: {entry.get('clinic_id', 'N/A')}")

def main():
    """Main function"""
    print("🎯 PCS AI - Queue Field Normalizer")
    print("=" * 50)
    
    normalize_invoice_queue()

if __name__ == "__main__":
    main() 