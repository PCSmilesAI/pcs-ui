#!/usr/bin/env python3
"""
Remove Duplicates Script
Removes duplicate invoice entries from the queue based on invoice number.
"""

import os
import json
from datetime import datetime

def remove_duplicates():
    """Remove duplicate entries from the invoice queue"""
    
    # Load current queue
    queue_file = "invoice_queue.json"
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    with open(queue_file, 'r') as f:
        current_queue = json.load(f)
    
    print(f"📋 Found {len(current_queue)} entries in current queue")
    
    # Remove duplicates - keep the first occurrence of each invoice number
    seen_invoices = set()
    unique_queue = []
    removed_count = 0
    
    for entry in current_queue:
        invoice_number = entry.get('invoice_number', '')
        
        if not invoice_number:
            # Skip entries without invoice numbers
            removed_count += 1
            print(f"🗑️ Removed: Empty invoice number")
            continue
        
        if invoice_number in seen_invoices:
            # Skip duplicate invoice numbers
            removed_count += 1
            print(f"🗑️ Removed duplicate: {invoice_number}")
            continue
        
        # Add to unique queue
        seen_invoices.add(invoice_number)
        unique_queue.append(entry)
        print(f"✅ Kept: {entry.get('vendor', 'Unknown')} - {invoice_number}")
    
    # Save deduplicated queue
    with open(queue_file, 'w') as f:
        json.dump(unique_queue, f, indent=2)
    
    print("=" * 50)
    print(f"📊 DEDUPLICATION COMPLETE")
    print(f"🗑️ Removed entries: {removed_count}")
    print(f"✅ Unique entries: {len(unique_queue)}")
    print("=" * 50)
    
    # Show final summary
    if unique_queue:
        print("\n📄 Final unique invoices:")
        for entry in unique_queue:
            print(f"  {entry.get('vendor', 'Unknown')} - {entry.get('invoice_number', 'No Number')} - ${entry.get('total', 'N/A')}")

def main():
    """Main function"""
    print("🎯 PCS AI - Remove Duplicates")
    print("=" * 50)
    
    remove_duplicates()

if __name__ == "__main__":
    main() 