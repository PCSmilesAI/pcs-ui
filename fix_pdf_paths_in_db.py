#!/usr/bin/env python3
"""
Fix PDF paths in database to match actual PDF files
"""

import os
import sqlite3
import glob
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

def find_pdf_file(filename):
    """Find PDF file in any of the possible directories"""
    for pdf_dir in PDF_DIRS:
        if os.path.exists(pdf_dir):
            pdf_path = os.path.join(pdf_dir, filename)
            if os.path.exists(pdf_path):
                return pdf_path
            # Try case-insensitive extension
            alt_path = os.path.join(pdf_dir, filename.replace('.pdf', '.PDF'))
            if os.path.exists(alt_path):
                return alt_path
    return None

def get_all_pdf_filenames():
    """Get all PDF filenames from all possible directories"""
    pdfs = set()
    for pdf_dir in PDF_DIRS:
        if os.path.exists(pdf_dir):
            for pdf_file in glob.glob(os.path.join(pdf_dir, '*.pdf')) + glob.glob(os.path.join(pdf_dir, '*.PDF')):
                pdfs.add(os.path.basename(pdf_file))
    return pdfs

def main():
    print("=" * 80)
    print("🔍 PDF Path Fixer")
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
    
    # Get all invoices with PDF paths
    cursor.execute("""
        SELECT id, invoice_number, pdf_path, source_file
        FROM invoices
        WHERE pdf_path IS NOT NULL AND pdf_path != ''
    """)
    invoices = cursor.fetchall()
    
    print(f"\n📊 Found {len(invoices)} invoices with PDF paths")
    
    fixed_count = 0
    not_found_count = 0
    already_correct = 0
    
    for invoice in invoices:
        invoice_id = invoice['id']
        invoice_number = invoice['invoice_number']
        pdf_path = invoice['pdf_path']
        source_file = invoice['source_file']
        
        # Extract filename from path
        if pdf_path:
            # Handle different path formats
            if '/' in pdf_path:
                filename = pdf_path.split('/')[-1]
            elif '\\' in pdf_path:
                filename = pdf_path.split('\\')[-1]
            else:
                filename = pdf_path
            
            # Remove leading slash if present
            filename = filename.lstrip('/')
            
            # Check if PDF exists
            actual_pdf_path = find_pdf_file(filename)
            
            if actual_pdf_path:
                # PDF exists - update path to use API endpoint format with sanitized name
                safe_filename = sanitize_filename(filename)
                new_pdf_path = api_pdf_path(safe_filename)
                
                # Only update if different
                if pdf_path != new_pdf_path:
                    cursor.execute("""
                        UPDATE invoices
                        SET pdf_path = ?
                        WHERE id = ?
                    """, (new_pdf_path, invoice_id))
                    fixed_count += 1
                    print(f"✅ Fixed: {invoice_number} -> {filename}")
                else:
                    already_correct += 1
            else:
                # Try to find PDF by source_file or invoice_number
                found = False
                
                # Try source_file
                if source_file:
                    source_filename = os.path.basename(source_file).replace('.json', '.pdf')
                    actual_pdf_path = find_pdf_file(source_filename)
                    if actual_pdf_path:
                        new_pdf_path = f"/api/pdf/{source_filename}"
                        cursor.execute("""
                            UPDATE invoices
                            SET pdf_path = ?
                            WHERE id = ?
                        """, (new_pdf_path, invoice_id))
                        fixed_count += 1
                        print(f"✅ Fixed (via source_file): {invoice_number} -> {source_filename}")
                        found = True
                
                # Try searching by partial match
                if not found:
                    for pdf_filename in all_pdfs:
                        # Check if invoice_number or source_file matches PDF filename
                        if invoice_number and invoice_number in pdf_filename:
                            new_pdf_path = f"/api/pdf/{pdf_filename}"
                            cursor.execute("""
                                UPDATE invoices
                                SET pdf_path = ?
                                WHERE id = ?
                            """, (new_pdf_path, invoice_id))
                            fixed_count += 1
                            print(f"✅ Fixed (via match): {invoice_number} -> {pdf_filename}")
                            found = True
                            break
                
                if not found:
                    not_found_count += 1
                    print(f"⚠️  Not found: {invoice_number} (looking for: {filename})")
    
    # Commit changes
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 80)
    print("📊 SUMMARY")
    print("=" * 80)
    print(f"✅ Fixed: {fixed_count}")
    print(f"✓ Already correct: {already_correct}")
    print(f"⚠️  Not found: {not_found_count}")
    print(f"📁 Total PDFs available: {len(all_pdfs)}")
    print("=" * 80)

if __name__ == "__main__":
    main()

