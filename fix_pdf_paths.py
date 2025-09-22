#!/usr/bin/env python3
"""
Fix PDF paths in the invoice queue to match actual PDF files
"""

import json
import os
import glob

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"
EMAIL_INVOICES_PATH = "email_invoices"

def find_corresponding_pdf(json_filename):
    """Find the PDF file that corresponds to a JSON file"""
    # Remove .json extension
    base_name = json_filename.replace('.json', '')
    
    # First try exact match
    exact_pdf = os.path.join(EMAIL_INVOICES_PATH, base_name + '.pdf')
    if os.path.exists(exact_pdf):
        return exact_pdf
    
    # If no exact match, look for PDFs that contain the base name
    # This handles cases where the JSON and PDF have different prefixes/suffixes
    for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
        if pdf_file.endswith('.pdf') and base_name in pdf_file:
            return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    # If still no match, return the expected path (for debugging)
    return os.path.join(EMAIL_INVOICES_PATH, base_name + '.pdf')

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Processing {len(invoices)} invoices...")
    
    updated_count = 0
    not_found_count = 0
    
    for invoice in invoices:
        if 'json_path' in invoice and invoice['json_path']:
            # Extract JSON filename from the path
            json_filename = os.path.basename(invoice['json_path'])
            
            # Find the corresponding PDF
            new_pdf_path = find_corresponding_pdf(json_filename)
            
            # Check if the PDF actually exists
            if os.path.exists(new_pdf_path):
                if invoice.get('pdf_path') != new_pdf_path:
                    invoice['pdf_path'] = new_pdf_path
                    updated_count += 1
                    print(f"✅ Updated PDF path for {invoice.get('invoice_number', 'Unknown')}: {new_pdf_path}")
            else:
                not_found_count += 1
                print(f"⚠️ PDF not found for {invoice.get('invoice_number', 'Unknown')}: {new_pdf_path}")
    
    # Save the updated invoice queue
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(invoices, f, indent=2)
    
    print(f"✅ Updated {updated_count} PDF paths, {not_found_count} PDFs not found")

if __name__ == "__main__":
    main()
