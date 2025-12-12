#!/usr/bin/env python3
"""
Fix Invoice PDF Paths

This script matches invoices in the SQLite database with PDF files on disk,
updating the pdf_path field for invoices that don't have one set.

Matching strategies:
1. Direct match by invoice number in filename
2. Match by source_file/json_path basename
3. Match by vendor + invoice number pattern
"""

import sqlite3
import os
import re
from pathlib import Path
from typing import Optional, Dict, List, Tuple

# Configuration
BASE_DIR = Path("/Users/BraxtonEllsworth/Desktop/pcs-ui")
DB_PATH = BASE_DIR / "pcs_ui_data" / "pcs.db"
EMAIL_INVOICES_DIR = BASE_DIR / "email_invoices"

def normalize_for_matching(s: str) -> str:
    """Normalize a string for fuzzy matching."""
    return re.sub(r'[^a-z0-9]', '', s.lower())

def extract_invoice_number(filename: str) -> Optional[str]:
    """Try to extract an invoice number from a filename."""
    # Remove common prefixes/suffixes and hash
    name = Path(filename).stem
    
    # Remove trailing hash (like _a1b2c3d4)
    name = re.sub(r'_[a-f0-9]{8}$', '', name)
    
    # Look for invoice number patterns
    patterns = [
        r'Invoice[_\s#]*(\d+)',  # Invoice_12345 or Invoice # 12345
        r'(\d{7,10})$',  # 7-10 digit number at end
        r'_(\d{7,10})_',  # 7-10 digit number between underscores
        r'^(\d{7,10})$',  # Just a number
    ]
    
    for pattern in patterns:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def build_api_pdf_path(filename: str) -> str:
    """Build the API path for a PDF filename."""
    return f"/api/pdf/{filename}"

def main():
    print("=" * 60)
    print("Invoice PDF Path Fixer")
    print("=" * 60)
    
    # Connect to database with explicit settings
    conn = sqlite3.connect(str(DB_PATH), isolation_level=None)  # Autocommit mode
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Set pragmas for WAL mode
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute("PRAGMA synchronous = NORMAL")
    
    # Get invoices without pdf_path
    cur.execute("""
        SELECT id, invoice_number, vendor_name, source_file, pdf_path
        FROM invoices
        WHERE (pdf_path IS NULL OR pdf_path = '') AND deleted = 0
    """)
    invoices_without_pdf = cur.fetchall()
    
    print(f"\nInvoices without pdf_path: {len(invoices_without_pdf)}")
    
    # Get all PDFs on disk
    pdf_files = [f for f in os.listdir(EMAIL_INVOICES_DIR) if f.lower().endswith('.pdf')]
    print(f"PDFs on disk: {len(pdf_files)}")
    
    # Build index of PDFs by various keys
    pdf_by_invoice_num: Dict[str, List[str]] = {}  # invoice_number -> list of matching PDFs
    pdf_by_normalized_name: Dict[str, str] = {}  # normalized name -> PDF
    
    for pdf in pdf_files:
        inv_num = extract_invoice_number(pdf)
        if inv_num:
            if inv_num not in pdf_by_invoice_num:
                pdf_by_invoice_num[inv_num] = []
            pdf_by_invoice_num[inv_num].append(pdf)
        
        normalized = normalize_for_matching(Path(pdf).stem)
        pdf_by_normalized_name[normalized] = pdf
    
    # Try to match invoices to PDFs
    matched = 0
    unmatched = 0
    unmatched_samples = []
    
    for inv in invoices_without_pdf:
        inv_id = inv['id']
        inv_num = inv['invoice_number']
        source_file = inv['source_file']
        vendor = inv['vendor_name'] or ''
        
        matched_pdf = None
        match_method = None
        
        # Strategy 1: Direct match by invoice number
        if inv_num and inv_num in pdf_by_invoice_num:
            candidates = pdf_by_invoice_num[inv_num]
            if len(candidates) == 1:
                matched_pdf = candidates[0]
                match_method = "invoice_number"
            elif len(candidates) > 1:
                # Multiple matches - try to pick by vendor
                for pdf in candidates:
                    pdf_lower = pdf.lower()
                    vendor_lower = vendor.lower()
                    if 'patterson' in vendor_lower and 'patterson' in pdf_lower:
                        matched_pdf = pdf
                        match_method = "invoice_number + vendor"
                        break
                    elif 'henry' in vendor_lower and ('henry' in pdf_lower or 'schein' in pdf_lower):
                        matched_pdf = pdf
                        match_method = "invoice_number + vendor"
                        break
                    elif 'tc' in vendor_lower and 'tc' in pdf_lower:
                        matched_pdf = pdf
                        match_method = "invoice_number + vendor"
                        break
                    elif 'darby' in vendor_lower and 'darby' in pdf_lower:
                        matched_pdf = pdf
                        match_method = "invoice_number + vendor"
                        break
                    elif 'epic' in vendor_lower and 'epic' in pdf_lower:
                        matched_pdf = pdf
                        match_method = "invoice_number + vendor"
                        break
                if not matched_pdf:
                    matched_pdf = candidates[0]  # Just pick first if no vendor match
                    match_method = "invoice_number (first match)"
        
        # Strategy 2: Match by source_file basename
        if not matched_pdf and source_file:
            # source_file might be a full path or just a basename
            base = Path(source_file).stem
            # If source_file is a full path to a PDF, just use the filename
            if source_file.endswith('.pdf'):
                pdf_name = Path(source_file).name
                if pdf_name in pdf_files:
                    matched_pdf = pdf_name
                    match_method = "source_file (full path)"
            
            if not matched_pdf:
                # Replace .json with .pdf extension
                pdf_name = base + ".pdf"
                if pdf_name in pdf_files:
                    matched_pdf = pdf_name
                    match_method = "source_file"
            
            if not matched_pdf:
                # Try normalized match
                normalized = normalize_for_matching(base)
                if normalized in pdf_by_normalized_name:
                    matched_pdf = pdf_by_normalized_name[normalized]
                    match_method = "source_file (normalized)"
        
        # Strategy 3: Search for invoice number in all PDFs
        if not matched_pdf and inv_num:
            for pdf in pdf_files:
                if inv_num in pdf:
                    matched_pdf = pdf
                    match_method = "substring search"
                    break
        
        if matched_pdf:
            api_path = build_api_pdf_path(matched_pdf)
            try:
                # Use invoice_number for update since id may be NULL
                cur.execute(
                    "UPDATE invoices SET pdf_path = ? WHERE invoice_number = ?",
                    (api_path, inv_num)
                )
                if cur.rowcount > 0:
                    matched += 1
                    if matched <= 10:
                        print(f"  ✅ {inv_num} -> {matched_pdf} ({match_method})")
                else:
                    unmatched += 1
                    if len(unmatched_samples) < 10:
                        unmatched_samples.append((inv_num, vendor, source_file))
                    print(f"  ⚠️ Update returned 0 rows for {inv_num}")
            except Exception as e:
                print(f"  ❌ Failed to update {inv_num}: {e}")
        else:
            unmatched += 1
            if len(unmatched_samples) < 10:
                unmatched_samples.append((inv_num, vendor, source_file))
    
    # Force WAL checkpoint to ensure writes are synced
    cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    
    print(f"\n" + "=" * 60)
    print(f"Results:")
    print(f"  ✅ Matched: {matched}")
    print(f"  ❌ Unmatched: {unmatched}")
    
    if unmatched_samples:
        print(f"\nSample unmatched invoices:")
        for inv_num, vendor, source in unmatched_samples:
            print(f"  - {inv_num} ({vendor})")
            if source:
                print(f"    source: {source}")
    
    # Verify final counts
    cur.execute("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN pdf_path IS NOT NULL AND pdf_path != '' THEN 1 ELSE 0 END) as with_pdf
        FROM invoices WHERE deleted = 0
    """)
    final = cur.fetchone()
    print(f"\nFinal counts:")
    print(f"  Total invoices: {final['total']}")
    print(f"  With pdf_path: {final['with_pdf']}")
    print(f"  Missing pdf_path: {final['total'] - final['with_pdf']}")
    
    conn.close()
    print("\nDone!")

if __name__ == "__main__":
    main()

