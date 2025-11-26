#!/usr/bin/env python3
"""
Fix missing PDF paths in database by matching invoices to PDF files
"""

import os
import sqlite3
import glob
import re
from pathlib import Path
from filename_utils import sanitize_filename, api_pdf_path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

DB_PATH = os.path.join(DATA_DIR, 'pcs.db')

# Possible PDF locations
PDF_DIRS = [
    os.path.join(DATA_DIR, 'email_invoices'),
    os.path.join(BASE_DIR, 'dist', 'email_invoices'),
    os.path.join(BASE_DIR, 'email_invoices'),
]

def get_all_pdf_filenames():
    """Get all PDF filenames from all possible directories"""
    pdfs = {}
    for pdf_dir in PDF_DIRS:
        if os.path.exists(pdf_dir):
            for pdf_file in glob.glob(os.path.join(pdf_dir, '*.pdf')) + glob.glob(os.path.join(pdf_dir, '*.PDF')):
                filename = os.path.basename(pdf_file)
                pdfs[filename.lower()] = filename  # Store lowercase key for matching
    return pdfs

def normalize_for_matching(text):
    """Normalize text for matching"""
    if not text:
        return ""
    return re.sub(r'[^a-z0-9]', '', text.lower())

def find_matching_pdf(invoice_number, source_file, all_pdfs):
    """Find matching PDF for invoice"""
    if not invoice_number and not source_file:
        return None
    
    # Try exact match first
    if invoice_number:
        normalized_inv = normalize_for_matching(invoice_number)
        for pdf_filename, actual_filename in all_pdfs.items():
            normalized_pdf = normalize_for_matching(pdf_filename)
            if normalized_inv in normalized_pdf or normalized_pdf in normalized_inv:
                return actual_filename
    
    # Try source_file match
    if source_file:
        source_base = os.path.basename(source_file).replace('.json', '')
        normalized_source = normalize_for_matching(source_base)
        
        for pdf_filename, actual_filename in all_pdfs.items():
            normalized_pdf = normalize_for_matching(pdf_filename)
            if normalized_source in normalized_pdf or normalized_pdf in normalized_source:
                return actual_filename
    
    return None

def main():
    print("=" * 80)
    print("🔍 Missing PDF Path Fixer")
    print("=" * 80)
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found: {DB_PATH}")
        return
    
    # Get all PDF filenames
    print("\n📁 Scanning for PDF files...")
    all_pdfs = get_all_pdf_filenames()
    print(f"✅ Found {len(all_pdfs)} PDF files")
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all invoices without PDF paths
    cursor.execute("""
        SELECT id, invoice_number, source_file
        FROM invoices
        WHERE pdf_path IS NULL OR pdf_path = ''
    """)
    invoices = cursor.fetchall()
    
    print(f"\n📊 Found {len(invoices)} invoices without PDF paths")
    
    fixed_count = 0
    not_found_count = 0
    
    for invoice in invoices:
        invoice_id = invoice['id']
        invoice_number = invoice['invoice_number'] or ''
        source_file = invoice['source_file'] or ''
        
        # Try to find matching PDF
        matching_pdf = find_matching_pdf(invoice_number, source_file, all_pdfs)
        
        if matching_pdf:
            # Normalize filename for future safety and build API path
            safe_filename = sanitize_filename(matching_pdf)
            new_pdf_path = api_pdf_path(safe_filename)
            cursor.execute("""
                UPDATE invoices
                SET pdf_path = ?
                WHERE id = ?
            """, (new_pdf_path, invoice_id))
            fixed_count += 1
            if fixed_count % 100 == 0:
                print(f"✅ Fixed {fixed_count} invoices...")
        else:
            not_found_count += 1
    
    # Commit changes
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 80)
    print("📊 SUMMARY")
    print("=" * 80)
    print(f"✅ Fixed: {fixed_count}")
    print(f"⚠️  Not found: {not_found_count}")
    print(f"📁 Total PDFs available: {len(all_pdfs)}")
    print("=" * 80)

if __name__ == "__main__":
    main()

