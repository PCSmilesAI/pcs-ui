#!/usr/bin/env python3
"""
Comprehensive PDF linking fix - match invoices to PDFs using multiple strategies
"""

import json
import os
import re
from pathlib import Path
from collections import defaultdict

INVOICE_QUEUE_PATH = "pcs_ai_data/invoice_queue.json"
EMAIL_INVOICES_PATH = "email_invoices"
OUTPUT_JSONS_PATH = "output_jsons"

def extract_invoice_number_from_pdf(pdf_filename):
    """Extract potential invoice numbers from PDF filename"""
    # Look for patterns like: email_XX_YYYYMMDD_HHMMSS_vendor_invoice_number_...
    patterns = [
        r'henryschein_(\d+)_',  # Henry Schein pattern
        r'patterson.*?(\d{10})',  # Patterson pattern
        r'(\d{8,10})',  # General 8-10 digit numbers
        r'(\d{4,7})',   # 4-7 digit numbers
    ]
    
    for pattern in patterns:
        match = re.search(pattern, pdf_filename, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def find_pdf_by_invoice_number(invoice_number, pdf_files):
    """Find PDF that contains the invoice number"""
    if not invoice_number:
        return None
    
    # Direct match
    for pdf_file in pdf_files:
        if invoice_number in pdf_file:
            return pdf_file
    
    # Partial match for long numbers
    if len(invoice_number) > 6:
        partial = invoice_number[:6]
        for pdf_file in pdf_files:
            if partial in pdf_file:
                return pdf_file
    
    return None

def find_pdf_by_vendor(invoice, pdf_files):
    """Find PDF by vendor name"""
    vendor = invoice.get('vendor_name', invoice.get('vendor', ''))
    if not vendor:
        return None
    
    vendor_lower = vendor.lower()
    for pdf_file in pdf_files:
        if vendor_lower in pdf_file.lower():
            return pdf_file
    
    return None

def find_pdf_by_date(invoice, pdf_files):
    """Find PDF by invoice date"""
    invoice_date = invoice.get('invoice_date', '')
    if not invoice_date:
        return None
    
    # Convert date to various formats
    date_formats = []
    try:
        from datetime import datetime
        if invoice_date:
            # Try to parse the date and create different formats
            if '/' in invoice_date:
                parts = invoice_date.split('/')
                if len(parts) == 3:
                    month, day, year = parts
                    if len(year) == 2:
                        year = '20' + year
                    date_formats.extend([
                        f"{year}{month.zfill(2)}{day.zfill(2)}",
                        f"{month.zfill(2)}{day.zfill(2)}{year}",
                        f"{year}{month.zfill(2)}",
                        f"{month.zfill(2)}{year}",
                    ])
    except:
        pass
    
    for pdf_file in pdf_files:
        for date_format in date_formats:
            if date_format in pdf_file:
                return pdf_file
    
    return None

def main():
    if not os.path.exists(INVOICE_QUEUE_PATH):
        print("❌ Invoice queue not found")
        return
    
    # Load the invoice queue
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        invoices = json.load(f)
    
    # Get all PDF files
    pdf_files = [f for f in os.listdir(EMAIL_INVOICES_PATH) if f.endswith('.pdf')]
    print(f"📊 Found {len(pdf_files)} PDF files")
    
    # Create a mapping of invoice numbers to PDFs
    invoice_to_pdf = {}
    
    # Strategy 1: Extract invoice numbers from PDF filenames
    for pdf_file in pdf_files:
        invoice_num = extract_invoice_number_from_pdf(pdf_file)
        if invoice_num:
            invoice_to_pdf[invoice_num] = pdf_file
    
    print(f"📊 Extracted {len(invoice_to_pdf)} invoice numbers from PDF filenames")
    
    updated_count = 0
    found_pdfs = 0
    missing_pdfs = 0
    
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
        
        # Try multiple strategies to find the PDF
        matching_pdf = None
        
        # Strategy 1: Direct invoice number match
        if invoice_number and invoice_number in invoice_to_pdf:
            matching_pdf = invoice_to_pdf[invoice_number]
        
        # Strategy 2: Search by invoice number in PDF files
        if not matching_pdf:
            matching_pdf = find_pdf_by_invoice_number(invoice_number, pdf_files)
        
        # Strategy 3: Search by vendor
        if not matching_pdf:
            matching_pdf = find_pdf_by_vendor(invoice, pdf_files)
        
        # Strategy 4: Search by date
        if not matching_pdf:
            matching_pdf = find_pdf_by_date(invoice, pdf_files)
        
        if matching_pdf:
            # Convert to API path
            new_pdf_path = f"/api/pdf/{matching_pdf}"
            
            if current_pdf != new_pdf_path:
                invoice['pdf_path'] = new_pdf_path
                updated_count += 1
                found_pdfs += 1
                print(f"✅ Found PDF for {invoice_number} ({invoice_id}): {matching_pdf}")
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
