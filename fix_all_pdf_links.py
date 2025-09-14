#!/usr/bin/env python3
"""
Fix all PDF links by matching invoices to their corresponding PDFs
"""

import json
import os
import re
from pathlib import Path

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"
EMAIL_INVOICES_PATH = "email_invoices"

def find_matching_pdf(invoice):
    """Find the PDF that matches an invoice based on various criteria"""
    if not invoice:
        return None
    
    # Get invoice details
    invoice_number = invoice.get('invoice_number', '')
    vendor = invoice.get('vendor_name', invoice.get('vendor', ''))
    json_path = invoice.get('json_path', '')
    
    # Extract base name from JSON path
    if json_path:
        json_filename = os.path.basename(json_path)
        base_name = json_filename.replace('.json', '')
    else:
        base_name = None
    
    # Strategy 1: Try to find PDF by JSON base name
    if base_name:
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if pdf_file.endswith('.pdf') and base_name in pdf_file:
                return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    # Strategy 2: Try to find PDF by invoice number
    if invoice_number:
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if invoice_number in pdf_file:
                return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    # Strategy 3: Try to find PDF by vendor name
    if vendor:
        vendor_lower = vendor.lower()
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if vendor_lower in pdf_file.lower():
                return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    # Strategy 4: Look for PDFs with similar patterns
    if invoice_number:
        # Try partial matches
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if any(char.isdigit() for char in pdf_file) and invoice_number[:6] in pdf_file:
                return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    return None

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Processing {len(invoices)} invoices...")
    
    updated_count = 0
    found_pdfs = 0
    missing_pdfs = 0
    
    for i, invoice in enumerate(invoices):
        invoice_id = invoice.get('id', f'invoice_{i}')
        invoice_number = invoice.get('invoice_number', 'Unknown')
        current_pdf = invoice.get('pdf_path', '')
        
        # Skip if already has a valid PDF path
        if current_pdf and os.path.exists(current_pdf.replace('/api/pdf/', EMAIL_INVOICES_PATH + '/')):
            found_pdfs += 1
            continue
        
        # Try to find matching PDF
        matching_pdf = find_matching_pdf(invoice)
        
        if matching_pdf and os.path.exists(matching_pdf):
            # Convert to API path
            pdf_filename = os.path.basename(matching_pdf)
            new_pdf_path = f"/api/pdf/{pdf_filename}"
            
            if current_pdf != new_pdf_path:
                invoice['pdf_path'] = new_pdf_path
                updated_count += 1
                found_pdfs += 1
                print(f"✅ Found PDF for {invoice_number} ({invoice_id}): {pdf_filename}")
        else:
            missing_pdfs += 1
            print(f"⚠️ No PDF found for {invoice_number} ({invoice_id})")
    
    # Save the updated invoice queue
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(invoices, f, indent=2)
    
    print(f"\n📊 Summary:")
    print(f"✅ Invoices with PDFs: {found_pdfs}")
    print(f"⚠️ Invoices missing PDFs: {missing_pdfs}")
    print(f"🔄 Updated PDF paths: {updated_count}")

if __name__ == "__main__":
    main()
