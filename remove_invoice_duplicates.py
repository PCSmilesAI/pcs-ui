#!/usr/bin/env python3
"""
Remove Invoice Duplicates Script
Removes duplicate invoices from the consolidated invoice queue based on invoice_number and vendor.
"""

import os
import json
from datetime import datetime

def remove_duplicates():
    """Remove duplicate invoices from the queue"""
    
    queue_file = os.path.join("pcs_ai_data", "invoice_queue.json")
    
    if not os.path.exists(queue_file):
        print(f"❌ Queue file not found: {queue_file}")
        return
    
    # Load current queue
    with open(queue_file, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Found {len(invoices)} invoices before deduplication")
    
    # Track seen invoices by a combination of key fields
    seen = set()
    unique_invoices = []
    duplicates_removed = 0
    
    for invoice in invoices:
        # Create a unique key based on invoice_number, vendor, and total
        vendor = invoice.get('vendor_name') or invoice.get('vendor', '')
        invoice_number = invoice.get('invoice_number', '')
        total = invoice.get('total') or invoice.get('invoice_total', '')
        office = invoice.get('office_location') or invoice.get('clinic_id', '')
        
        # Use multiple fields to identify duplicates
        unique_key = f"{vendor}|{invoice_number}|{total}|{office}"
        
        if unique_key in seen:
            print(f"🗑️ Removing duplicate: {vendor} - Invoice {invoice_number} - ${total}")
            duplicates_removed += 1
        else:
            seen.add(unique_key)
            unique_invoices.append(invoice)
    
    # Save deduplicated invoices
    with open(queue_file, 'w') as f:
        json.dump(unique_invoices, f, indent=2)
    
    print(f"\n🎉 Deduplication complete!")
    print(f"📊 Original invoices: {len(invoices)}")
    print(f"✅ Unique invoices: {len(unique_invoices)}")
    print(f"🗑️ Duplicates removed: {duplicates_removed}")
    print(f"💾 Saved to: {queue_file}")
    
    return len(unique_invoices)

if __name__ == "__main__":
    remove_duplicates()
