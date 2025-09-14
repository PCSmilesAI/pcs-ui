#!/usr/bin/env python3
"""
Fix Patterson PDF links specifically
"""

import json
import os
import re

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"
EMAIL_INVOICES_PATH = "email_invoices"

def find_patterson_pdf(invoice_number):
    """Find Patterson PDF by invoice number"""
    if not invoice_number:
        return None
    
    for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
        if 'patterson' in pdf_file.lower() and invoice_number in pdf_file:
            return pdf_file
    
    return None

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Processing {len(invoices)} invoices for Patterson PDFs...")
    
    updated_count = 0
    found_pdfs = 0
    
    for i, invoice in enumerate(invoices):
        invoice_id = invoice.get('id', f'invoice_{i}')
        invoice_number = invoice.get('invoice_number', '')
        current_pdf = invoice.get('pdf_path', '')
        
        # Skip if already has a valid PDF path
        if current_pdf and '/api/pdf/' in current_pdf:
            pdf_filename = current_pdf.replace('/api/pdf/', '')
            if os.path.exists(os.path.join(EMAIL_INVOICES_PATH, pdf_filename)):
                found_pdfs += 1
                continue
        
        # Look for Patterson PDFs
        if invoice_number and len(invoice_number) >= 8:  # Patterson invoice numbers are long
            matching_pdf = find_patterson_pdf(invoice_number)
            
            if matching_pdf:
                new_pdf_path = f"/api/pdf/{matching_pdf}"
                
                if current_pdf != new_pdf_path:
                    invoice['pdf_path'] = new_pdf_path
                    updated_count += 1
                    found_pdfs += 1
                    print(f"✅ Found Patterson PDF for {invoice_number} ({invoice_id}): {matching_pdf}")
            else:
                print(f"⚠️ No Patterson PDF found for {invoice_number} ({invoice_id})")
        else:
            found_pdfs += 1  # Count as found if no invoice number
    
    # Save the updated invoice queue
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(invoices, f, indent=2)
    
    print(f"\n📊 Summary:")
    print(f"✅ Invoices with PDFs: {found_pdfs}")
    print(f"🔄 Updated PDF paths: {updated_count}")

if __name__ == "__main__":
    main()
