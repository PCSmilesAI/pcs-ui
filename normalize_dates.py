#!/usr/bin/env python3
"""
Normalize all invoice_date and due_date fields to MM/DD/YYYY format.

Handles various input formats:
- 2025-10-19T21:31:42.827Z (ISO with time)
- 2025-07-31 (ISO date)
- 11/05/2025 (already correct)
- 09/09/25 (short year)
- 5/13/2025 (missing leading zeros)
"""

import os
import sys
import sqlite3
import re
from datetime import datetime

# Path configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, 'pcs_ui_data', 'pcs.db')

def parse_date(date_str):
    """Parse various date formats and return a datetime object."""
    if not date_str or not str(date_str).strip():
        return None
    
    date_str = str(date_str).strip()
    
    # Remove time portion if present (ISO format with T)
    if 'T' in date_str:
        date_str = date_str.split('T')[0]
    
    # Try ISO format: YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        try:
            return datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            pass
    
    # Try MM/DD/YYYY (already correct format, but validate)
    if re.match(r'^\d{2}/\d{2}/\d{4}$', date_str):
        try:
            return datetime.strptime(date_str, '%m/%d/%Y')
        except ValueError:
            pass
    
    # Try M/D/YYYY or M/DD/YYYY or MM/D/YYYY (variable leading zeros)
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str)
    if match:
        month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    # Try MM/DD/YY (short year)
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2})$', date_str)
    if match:
        month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        # Assume 20xx for years < 50, 19xx for years >= 50
        if year < 50:
            year += 2000
        else:
            year += 1900
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    # Try MM-DD-YYYY
    match = re.match(r'^(\d{1,2})-(\d{1,2})-(\d{4})$', date_str)
    if match:
        month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    return None

def format_date(dt):
    """Format datetime as MM/DD/YYYY."""
    if not dt:
        return None
    return dt.strftime('%m/%d/%Y')

def normalize_date(date_str):
    """Parse a date string and return it in MM/DD/YYYY format."""
    dt = parse_date(date_str)
    if dt:
        return format_date(dt)
    return None  # Return None if unparseable, keeping original would be bad

def main():
    print(f"📅 Normalizing dates to MM/DD/YYYY format...")
    print(f"   Database: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found: {DB_PATH}")
        sys.exit(1)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Stats
    invoice_date_updated = 0
    due_date_updated = 0
    invoice_date_skipped = 0
    due_date_skipped = 0
    errors = 0
    
    # Get all invoices with dates
    cursor.execute("""
        SELECT id, invoice_number, invoice_date, due_date 
        FROM invoices 
        WHERE invoice_date IS NOT NULL OR due_date IS NOT NULL
    """)
    
    invoices = cursor.fetchall()
    print(f"\n📊 Found {len(invoices)} invoices with date fields")
    
    for inv_id, inv_number, inv_date, due_date in invoices:
        # Normalize invoice_date
        if inv_date and str(inv_date).strip():
            normalized = normalize_date(inv_date)
            if normalized and normalized != inv_date:
                try:
                    cursor.execute(
                        "UPDATE invoices SET invoice_date = ? WHERE id = ?",
                        (normalized, inv_id)
                    )
                    invoice_date_updated += 1
                    if invoice_date_updated <= 10:  # Show first 10 examples
                        print(f"   ✅ invoice_date: {inv_date} → {normalized}")
                except Exception as e:
                    errors += 1
                    print(f"   ❌ {inv_number}: Error updating invoice_date - {e}")
            elif not normalized and inv_date:
                invoice_date_skipped += 1
                if invoice_date_skipped <= 5:
                    print(f"   ⚠️ Could not parse invoice_date: '{inv_date}'")
        
        # Normalize due_date
        if due_date and str(due_date).strip():
            normalized = normalize_date(due_date)
            if normalized and normalized != due_date:
                try:
                    cursor.execute(
                        "UPDATE invoices SET due_date = ? WHERE id = ?",
                        (normalized, inv_id)
                    )
                    due_date_updated += 1
                    if due_date_updated <= 10:  # Show first 10 examples
                        print(f"   ✅ due_date: {due_date} → {normalized}")
                except Exception as e:
                    errors += 1
                    print(f"   ❌ {inv_number}: Error updating due_date - {e}")
            elif not normalized and due_date:
                due_date_skipped += 1
                if due_date_skipped <= 5:
                    print(f"   ⚠️ Could not parse due_date: '{due_date}'")
    
    # Commit changes
    conn.commit()
    
    # Summary
    print(f"\n📊 Normalization Summary:")
    print(f"   ✅ invoice_date updated: {invoice_date_updated}")
    print(f"   ✅ due_date updated: {due_date_updated}")
    print(f"   ⚠️ invoice_date unparseable: {invoice_date_skipped}")
    print(f"   ⚠️ due_date unparseable: {due_date_skipped}")
    print(f"   ❌ Errors: {errors}")
    
    # Verify with samples
    print(f"\n📋 Sample dates after normalization:")
    cursor.execute("""
        SELECT invoice_number, invoice_date, due_date 
        FROM invoices 
        WHERE invoice_date IS NOT NULL AND invoice_date != ''
        ORDER BY created_at DESC 
        LIMIT 10
    """)
    for row in cursor.fetchall():
        print(f"   {row[0]}: invoice={row[1]}, due={row[2]}")
    
    conn.close()
    print("\n✅ Normalization complete!")

if __name__ == '__main__':
    main()

