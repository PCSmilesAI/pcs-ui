#!/usr/bin/env python3
"""
Full Invoice Reprocessing Script

This script reprocesses all incorrectly parsed invoices in the database by:
1. Identifying invoices with vendor_name='tc' or amount_cents=0
2. Verifying PDF files exist on disk
3. Running vendor detection to identify correct vendor
4. Routing to appropriate parser
5. Updating the database with properly parsed data
6. Removing invoices that don't have valid PDF attachments
"""

import os
import sys
import json
import sqlite3
import subprocess
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

# Configuration
BASE_DIR = Path("/Users/BraxtonEllsworth/Desktop/pcs-ui")
DATA_DIR = BASE_DIR / "pcs_ui_data"
DB_PATH = DATA_DIR / "pcs.db"
EMAIL_INVOICES_DIR = BASE_DIR / "email_invoices"
OUTPUT_JSONS_DIR = DATA_DIR / "output_jsons"

# Parser mappings
VENDOR_PARSERS = {
    'epic': 'epic_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'henry': 'henry_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py',
    'darby': 'darby_parser.py',
    'dandy': 'dandy_parser.py',
    'brasseler': 'brasseler_parser.py',
    'ctr_services': 'ctr_services_parser.py',
    'a1_professional': 'a1_professional_parser.py',
    'comcast': 'comcast_parser.py',
    'bridgeford': 'bridgeford_parser.py',
    'general': 'general_invoice_parser.py',
    # New parsers from Unknown invoice review
    'linde_gas': 'linde_gas_parser.py',
    'kettenbach': 'kettenbach_parser.py',
    'republic_services': 'republic_services_parser.py',
    'clipboard_health': 'clipboard_health_parser.py',
    'airgas': 'linde_gas_parser.py',
    # Vendors using general parser
    'waterco': 'general_invoice_parser.py',
    'dental_medical_staffing': 'general_invoice_parser.py',
    'crest_oralb': 'general_invoice_parser.py',
    'physicians_resource': 'general_invoice_parser.py',
    'oral_biotech': 'general_invoice_parser.py',
    'oregon_linen': 'general_invoice_parser.py',
    'cintas': 'general_invoice_parser.py',
    'trilogy_medwaste': 'general_invoice_parser.py',
    'glidewell': 'general_invoice_parser.py',
    'do_good_cleaning': 'general_invoice_parser.py',
    'ultradent': 'general_invoice_parser.py',
}

# Vendor display names
VENDOR_DISPLAY_NAMES = {
    'henry': 'Henry Schein',
    'patterson': 'Patterson Dental',
    'epic': 'Epic Dental Lab',
    'tc': 'TC Dental',
    'darby': 'Darby Dental',
    'dandy': 'Dandy',
    'brasseler': 'Brasseler USA',
    'ctr_services': 'CTR Services',
    'a1_professional': 'A-1 Professional',
    'comcast': 'Comcast',
    'bridgeford': 'Bridgeford',
    'exodus': 'Exodus',
    'artisan': 'Artisan Dental',
    'general': 'Unknown',
    'waterco': 'WaterCo',
    'dental_medical_staffing': 'Dental Medical Staffing',
    'crest_oralb': 'Crest & Oral-B',
    'physicians_resource': "Physician's Resource",
    # New vendors from Unknown invoice review
    'linde_gas': 'Linde Gas & Equipment',
    'kettenbach': 'Kettenbach LP',
    'republic_services': 'Republic Services',
    'clipboard_health': 'Clipboard Health',
    'airgas': 'Airgas USA',
    'oral_biotech': 'Oral BioTech',
    'oregon_linen': 'Oregon Linen',
    'cintas': 'Cintas',
    'trilogy_medwaste': 'Trilogy Medwaste',
    'glidewell': 'Glidewell',
    'do_good_cleaning': 'Do Good Cleaning',
    'ultradent': 'Ultradent Products',
    'shred_it': 'Shred-It',
    'pacific_office': 'Pacific Office Automation',
}


def get_pdf_path_from_db_path(pdf_path: str) -> Optional[Path]:
    """Extract actual file path from database pdf_path value."""
    if not pdf_path:
        return None
    
    # Handle /api/pdf/ format
    if pdf_path.startswith('/api/pdf/'):
        filename = pdf_path.replace('/api/pdf/', '')
        return EMAIL_INVOICES_DIR / filename
    
    # Handle email_invoices/ format
    if 'email_invoices/' in pdf_path:
        filename = pdf_path.split('/')[-1]
        return EMAIL_INVOICES_DIR / filename
    
    # Handle full path format
    if pdf_path.startswith('/Users/'):
        return Path(pdf_path)
    
    # Assume it's just a filename
    return EMAIL_INVOICES_DIR / pdf_path


def detect_vendor(pdf_path: Path) -> Tuple[str, float]:
    """Detect vendor from PDF using vendor_detector.py."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from vendor_detector import detect_vendor as _detect_vendor
        result = _detect_vendor(str(pdf_path), 0.3)  # Lower threshold for detection
        return result.vendor or 'general', result.confidence
    except Exception as e:
        print(f"    Vendor detection error: {e}")
        return 'general', 0.0


def run_parser(pdf_path: Path, vendor: str) -> Optional[Dict[str, Any]]:
    """Run the appropriate parser and return parsed data."""
    parser_file = VENDOR_PARSERS.get(vendor, 'general_invoice_parser.py')
    parser_path = BASE_DIR / parser_file
    
    if not parser_path.exists():
        print(f"    Parser not found: {parser_file}")
        return None
    
    try:
        result = subprocess.run(
            ['python3', str(parser_path), str(pdf_path)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(BASE_DIR)
        )
        
        # Try to find output JSON
        base_name = pdf_path.stem
        json_path = OUTPUT_JSONS_DIR / f"{base_name}.json"
        
        if json_path.exists():
            with open(json_path) as f:
                data = json.load(f)
            return data
        
        # Try to parse stdout as JSON
        if result.stdout.strip():
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                pass
        
        return None
    except subprocess.TimeoutExpired:
        print(f"    Parser timeout: {vendor}")
        return None
    except Exception as e:
        print(f"    Parser error: {e}")
        return None


def extract_invoice_number_from_filename(filename: str) -> Optional[str]:
    """Try to extract invoice number from filename as fallback."""
    # Remove extension and hash suffix
    name = Path(filename).stem
    name = re.sub(r'_[a-f0-9]{8}$', '', name)
    
    # Look for common patterns
    patterns = [
        r'Invoice[_\s#]*(\d{5,})',  # Invoice # 12345
        r'#\s*(\d{5,})',  # # 12345
        r'(\d{7,10})$',  # 7-10 digit number at end
        r'^(\d{7,10})',  # 7-10 digit number at start
    ]
    
    for pattern in patterns:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None


def parse_amount(amount_str: Any) -> int:
    """Parse amount string to cents."""
    if not amount_str:
        return 0
    
    amount_str = str(amount_str)
    # Remove currency symbols and commas
    cleaned = re.sub(r'[^\d.]', '', amount_str)
    try:
        return int(float(cleaned) * 100)
    except ValueError:
        return 0


def update_invoice_in_db(conn: sqlite3.Connection, invoice_id: str, 
                         invoice_number: str, data: Dict[str, Any], 
                         vendor: str) -> bool:
    """Update invoice in database with parsed data."""
    try:
        cur = conn.cursor()
        
        # Extract fields from parsed data
        new_invoice_number = data.get('invoice_number') or data.get('invoice')
        new_vendor = VENDOR_DISPLAY_NAMES.get(vendor, data.get('vendor', 'Unknown'))
        amount_cents = parse_amount(data.get('invoice_total') or data.get('total'))
        invoice_date = data.get('invoice_date', '')
        due_date = data.get('due_date', '')
        office_location = data.get('office_location', '')
        
        # Clean up invoice number - should be a proper ID, not a filename
        if new_invoice_number:
            # Remove any file path or extension
            new_invoice_number = str(new_invoice_number).strip()
            # Skip generic/bad invoice numbers
            if new_invoice_number.lower() in ['number', 'invoice', 'n/a', 'unknown', '', 'sap']:
                new_invoice_number = None
            # If it still looks like a filename, try to extract number
            elif '_' in new_invoice_number and len(new_invoice_number) > 30:
                extracted = extract_invoice_number_from_filename(new_invoice_number)
                if extracted:
                    new_invoice_number = extracted
                else:
                    new_invoice_number = None
        
        if not new_invoice_number:
            # Try to extract from original invoice_number (filename)
            extracted = extract_invoice_number_from_filename(invoice_number)
            if extracted:
                new_invoice_number = extracted
        
        # Use original if we couldn't find a better one
        if not new_invoice_number:
            new_invoice_number = invoice_number
        
        # Check if new invoice_number would cause a conflict
        if new_invoice_number != invoice_number:
            cur.execute("SELECT id FROM invoices WHERE invoice_number = ? AND invoice_number != ?", 
                       (new_invoice_number, invoice_number))
            if cur.fetchone():
                # Would conflict, keep original
                new_invoice_number = invoice_number
        
        cur.execute("""
            UPDATE invoices SET
                invoice_number = ?,
                vendor_name = ?,
                parsed_vendor_name = ?,
                amount_cents = ?,
                parsed_amount_cents = ?,
                invoice_date = ?,
                due_date = ?,
                office_location = ?,
                office_id = ?,
                updated_at = ?
            WHERE id = ? OR invoice_number = ?
        """, (
            new_invoice_number,
            new_vendor,
            new_vendor,
            amount_cents,
            amount_cents,
            invoice_date,
            due_date,
            office_location,
            office_location,
            datetime.now().isoformat(),
            invoice_id,
            invoice_number,
        ))
        
        return cur.rowcount > 0
    except Exception as e:
        print(f"    DB update error: {e}")
        return False


def delete_invoice_from_db(conn: sqlite3.Connection, invoice_id: str, invoice_number: str) -> bool:
    """Delete invoice from database (soft delete)."""
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE invoices SET 
                deleted = 1,
                workflow_deleted_at = ?
            WHERE id = ? OR invoice_number = ?
        """, (datetime.now().isoformat(), invoice_id, invoice_number))
        return cur.rowcount > 0
    except Exception as e:
        print(f"    DB delete error: {e}")
        return False


def main():
    print("=" * 70)
    print("Invoice Reprocessing Script")
    print("=" * 70)
    
    # Connect to database
    conn = sqlite3.connect(str(DB_PATH), isolation_level=None)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute("PRAGMA synchronous = NORMAL")
    
    # Get invoices that need reprocessing
    cur.execute("""
        SELECT id, invoice_number, vendor_name, amount_cents, pdf_path, source_file
        FROM invoices
        WHERE deleted = 0 AND (
            vendor_name = 'tc' 
            OR amount_cents = 0 
            OR amount_cents IS NULL
            OR vendor_name IS NULL
            OR vendor_name = ''
        )
        ORDER BY invoice_number
    """)
    invoices = cur.fetchall()
    
    print(f"\nFound {len(invoices)} invoices to reprocess\n")
    
    # Statistics
    stats = {
        'processed': 0,
        'updated': 0,
        'deleted': 0,
        'failed': 0,
        'no_pdf': 0,
        'vendors': {},
    }
    
    for i, inv in enumerate(invoices, 1):
        inv_id = inv['id']
        inv_num = inv['invoice_number']
        pdf_path_str = inv['pdf_path'] or inv['source_file']
        
        print(f"[{i}/{len(invoices)}] {inv_num[:50]}...")
        
        # Get PDF path
        pdf_path = get_pdf_path_from_db_path(pdf_path_str)
        
        if not pdf_path or not pdf_path.exists():
            print(f"    ❌ PDF not found: {pdf_path_str}")
            if delete_invoice_from_db(conn, inv_id, inv_num):
                stats['deleted'] += 1
                print(f"    🗑️ Removed from database")
            stats['no_pdf'] += 1
            continue
        
        # Detect vendor
        vendor, confidence = detect_vendor(pdf_path)
        print(f"    Detected: {vendor} ({confidence:.0%} confidence)")
        
        # Track vendor stats
        stats['vendors'][vendor] = stats['vendors'].get(vendor, 0) + 1
        
        # Run parser
        parsed_data = run_parser(pdf_path, vendor)
        
        if parsed_data:
            # Update database
            if update_invoice_in_db(conn, inv_id, inv_num, parsed_data, vendor):
                stats['updated'] += 1
                new_inv_num = parsed_data.get('invoice_number', inv_num)
                new_total = parsed_data.get('invoice_total', parsed_data.get('total', '0'))
                print(f"    ✅ Updated: #{new_inv_num}, ${new_total}")
            else:
                stats['failed'] += 1
                print(f"    ⚠️ Update failed")
        else:
            # Try general parser as fallback
            if vendor != 'general':
                print(f"    Trying general parser...")
                parsed_data = run_parser(pdf_path, 'general')
                if parsed_data:
                    if update_invoice_in_db(conn, inv_id, inv_num, parsed_data, 'general'):
                        stats['updated'] += 1
                        print(f"    ✅ Updated with general parser")
                    else:
                        stats['failed'] += 1
                else:
                    stats['failed'] += 1
                    print(f"    ❌ All parsers failed")
            else:
                stats['failed'] += 1
                print(f"    ❌ Parser returned no data")
        
        stats['processed'] += 1
        
        # Commit every 50 records
        if i % 50 == 0:
            cur.execute("PRAGMA wal_checkpoint(PASSIVE)")
    
    # Final checkpoint
    cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    
    # Print summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Total processed: {stats['processed']}")
    print(f"Successfully updated: {stats['updated']}")
    print(f"Deleted (no PDF): {stats['deleted']}")
    print(f"Failed to parse: {stats['failed']}")
    print(f"\nVendor breakdown:")
    for vendor, count in sorted(stats['vendors'].items(), key=lambda x: -x[1]):
        print(f"  {vendor}: {count}")
    
    return stats


if __name__ == "__main__":
    main()

