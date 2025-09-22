#!/usr/bin/env python3
"""
Clean up empty invoices from the invoice queue
"""

import json
import os

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"

def is_meaningful_invoice(invoice):
    """Check if an invoice has meaningful data"""
    if not invoice:
        return False
    
    # Check if we have at least one meaningful field
    meaningful_fields = [
        'invoice_number', 'invoice_total', 'invoice_date', 
        'office_location', 'line_items'
    ]
    
    for field in meaningful_fields:
        if field in invoice and invoice[field]:
            if field == 'line_items' and isinstance(invoice[field], list) and len(invoice[field]) > 0:
                return True
            elif field != 'line_items' and str(invoice[field]).strip():
                return True
    
    return False

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Original invoice count: {len(invoices)}")
    
    # Filter out empty invoices
    meaningful_invoices = [inv for inv in invoices if is_meaningful_invoice(inv)]
    
    print(f"📊 Meaningful invoice count: {len(meaningful_invoices)}")
    print(f"🗑️  Removed {len(invoices) - len(meaningful_invoices)} empty invoices")
    
    # Save the cleaned queue
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(meaningful_invoices, f, indent=2)
    
    print("✅ Invoice queue cleaned successfully!")

if __name__ == "__main__":
    main()
