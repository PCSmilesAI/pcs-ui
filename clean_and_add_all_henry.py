#!/usr/bin/env python3
"""
Clean and Add All Henry Script
Cleans the queue by removing entries with empty invoice numbers and adds all remaining Henry Schein invoices.
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

def normalize_queue_entry(json_file, pdf_file, invoice_data):
    """Create a normalized queue entry from invoice data"""
    
    # Extract fields from invoice data
    invoice_number = invoice_data.get('invoice_number', '')
    invoice_date = invoice_data.get('invoice_date', '')
    vendor = invoice_data.get('vendor', '')
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
        "json_path": json_file,
        "pdf_path": pdf_file,
        "timestamp": datetime.now().isoformat(),
        "assigned_to": None,
        "approved": False
    }
    
    return normalized_entry

def clean_and_add_all_henry():
    """Clean queue and add all Henry Schein invoices"""
    
    # Load current queue
    queue_file = "invoice_queue.json"
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    with open(queue_file, 'r') as f:
        current_queue = json.load(f)
    
    print(f"📋 Found {len(current_queue)} entries in current queue")
    
    # Clean queue - keep only entries with valid invoice numbers
    cleaned_queue = []
    for entry in current_queue:
        if entry.get('invoice_number') and entry.get('invoice_number').strip():
            cleaned_queue.append(entry)
            print(f"✅ Kept: {entry.get('vendor', 'Unknown')} - {entry.get('invoice_number', 'No Number')}")
        else:
            print(f"🗑️ Removed: Empty invoice number")
    
    print(f"🧹 Cleaned queue: {len(cleaned_queue)} entries")
    
    # Find all Henry Schein JSON files
    json_files = glob.glob("output_jsons/email_*.json")
    print(f"📄 Found {len(json_files)} email JSON files")
    
    # Track which files are already in queue
    existing_json_files = {entry.get('json_path') for entry in cleaned_queue}
    
    # Add new Henry Schein invoices
    added_count = 0
    for json_file in json_files:
        # Skip if already in queue
        if json_file in existing_json_files:
            continue
        
        # Load invoice data
        invoice_data = load_json_file(json_file)
        if not invoice_data:
            continue
        
        # Only process Henry Schein invoices with valid data
        vendor = invoice_data.get('vendor', '').lower()
        if 'henry' in vendor and invoice_data.get('invoice_number'):
            pdf_file = f"email_invoices/{os.path.basename(json_file).replace('.json', '.pdf')}"
            
            # Create normalized entry
            normalized_entry = normalize_queue_entry(json_file, pdf_file, invoice_data)
            cleaned_queue.append(normalized_entry)
            added_count += 1
            
            print(f"✅ Added: {invoice_data.get('vendor', 'Unknown')} - {invoice_data.get('invoice_number', 'No Number')}")
    
    # Save updated queue
    with open(queue_file, 'w') as f:
        json.dump(cleaned_queue, f, indent=2)
    
    print("=" * 50)
    print(f"📊 CLEAN AND ADD COMPLETE")
    print(f"🧹 Cleaned entries: {len(current_queue) - len(cleaned_queue) + added_count}")
    print(f"✅ Added entries: {added_count}")
    print(f"📋 Total entries: {len(cleaned_queue)}")
    print("=" * 50)
    
    # Show final queue summary
    if cleaned_queue:
        print("\n📄 Final queue summary:")
        vendors = {}
        for entry in cleaned_queue:
            vendor = entry.get('vendor', 'Unknown')
            vendors[vendor] = vendors.get(vendor, 0) + 1
        
        for vendor, count in vendors.items():
            print(f"  {vendor}: {count} invoices")

def main():
    """Main function"""
    print("🎯 PCS AI - Clean and Add All Henry")
    print("=" * 50)
    
    clean_and_add_all_henry()

if __name__ == "__main__":
    main() 