#!/usr/bin/env python3
"""
Update PDF paths in the invoice queue to use the new API route
"""

import json
import os

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Processing {len(invoices)} invoices...")
    
    updated_count = 0
    
    for invoice in invoices:
        if 'pdf_path' in invoice and invoice['pdf_path']:
            # Extract filename from the current path
            current_path = invoice['pdf_path']
            filename = os.path.basename(current_path)
            
            # Update to use the new API route
            new_path = f"/api/pdf/{filename}"
            
            if current_path != new_path:
                invoice['pdf_path'] = new_path
                updated_count += 1
                print(f"✅ Updated PDF path for {invoice.get('invoice_number', 'Unknown')}: {new_path}")
    
    # Save the updated invoice queue
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(invoices, f, indent=2)
    
    print(f"✅ Updated {updated_count} PDF paths to use API route")

if __name__ == "__main__":
    main()
