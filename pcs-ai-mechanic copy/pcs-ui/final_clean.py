#!/usr/bin/env python3
"""
Final Clean Script
Keeps only the 7 Henry Schein invoices that have matching email_* format PDFs.
"""

import os
import json
from datetime import datetime

def final_clean():
    """Keep only the 7 Henry Schein invoices with matching email_* PDFs"""
    
    # Load current queue
    queue_file = "invoice_queue.json"
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    with open(queue_file, 'r') as f:
        current_queue = json.load(f)
    
    print(f"📋 Found {len(current_queue)} entries in current queue")
    
    # Keep only invoices with email_* format PDFs
    cleaned_queue = []
    for entry in current_queue:
        pdf_path = entry.get('pdf_path', '')
        
        # Check if this is a properly formatted Henry Schein invoice with email_* PDF
        if (entry.get('vendor') == 'Henry Schein' and 
            entry.get('invoice_number') and 
            entry.get('total') and 
            entry.get('clinic_id') and
            entry.get('json_path') and
            'email_' in pdf_path and
            not pdf_path.startswith('/Users/')):
            
            # Reset status to 'new' for UI processing
            entry['status'] = 'new'
            cleaned_queue.append(entry)
            print(f"✅ Kept: {entry['invoice_number']} - {entry['vendor']} - ${entry['total']}")
        else:
            print(f"🗑️ Removed: {entry.get('invoice_number', 'Unknown')} - {entry.get('vendor', 'Unknown')}")
    
    # Save cleaned queue
    with open(queue_file, 'w') as f:
        json.dump(cleaned_queue, f, indent=2)
    
    print("=" * 50)
    print(f"📊 FINAL CLEANING COMPLETE")
    print(f"✅ Kept entries: {len(cleaned_queue)}")
    print(f"🗑️ Removed entries: {len(current_queue) - len(cleaned_queue)}")
    print("=" * 50)
    
    # Show final summary
    if cleaned_queue:
        print("\n📄 Final clean queue:")
        for entry in cleaned_queue:
            print(f"  {entry['vendor']} - {entry['invoice_number']} - ${entry['total']} - {entry['clinic_id']}")

def main():
    """Main function"""
    print("🎯 PCS AI - Final Clean")
    print("=" * 50)
    
    final_clean()

if __name__ == "__main__":
    main() 