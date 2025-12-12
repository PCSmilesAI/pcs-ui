#!/usr/bin/env python3
"""
Backfill due_date for existing invoices.

1. For invoices with JSON files that have due_date, update the database
2. For invoices with invoice_date but no due_date, calculate due_date = invoice_date + 30 days
"""

import os
import sys
import json
import sqlite3
from datetime import datetime, timedelta
import re

# Path configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, 'pcs_ui_data', 'pcs.db')
JSON_DIR = os.path.join(SCRIPT_DIR, 'output_jsons')

def parse_date(date_str):
    """Parse various date formats and return a datetime object."""
    if not date_str or not str(date_str).strip():
        return None
    
    date_str = str(date_str).strip()
    
    # Try different date formats
    formats = [
        '%Y-%m-%d',           # ISO format: 2025-07-31
        '%Y-%m-%dT%H:%M:%S',  # ISO with time
        '%Y-%m-%dT%H:%M:%S.%fZ',  # ISO with milliseconds
        '%m/%d/%Y',           # US format: 07/31/2025
        '%m/%d/%y',           # US short: 07/31/25
        '%m-%d-%Y',           # US with dashes
        '%m-%d-%y',           # US short with dashes
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str.split('T')[0] if 'T' in date_str else date_str, fmt)
        except ValueError:
            continue
    
    # Try parsing MM/DD/YY format more flexibly
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', date_str)
    if match:
        month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if year < 100:
            year += 2000
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    return None

def format_date(dt):
    """Format datetime as MM/DD/YYYY for database storage."""
    if not dt:
        return None
    return dt.strftime('%m/%d/%Y')

def calculate_due_date(invoice_date_str):
    """Calculate due date as invoice_date + 30 days."""
    invoice_date = parse_date(invoice_date_str)
    if not invoice_date:
        return None
    due_date = invoice_date + timedelta(days=30)
    return format_date(due_date)

def main():
    print(f"📅 Backfilling due_dates in database...")
    print(f"   Database: {DB_PATH}")
    print(f"   JSON Directory: {JSON_DIR}")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found: {DB_PATH}")
        sys.exit(1)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Stats
    updated_from_json = 0
    updated_calculated = 0
    skipped = 0
    errors = 0
    
    # Step 1: Get all invoices that are missing due_date
    cursor.execute("""
        SELECT id, invoice_number, source_file, invoice_date, due_date 
        FROM invoices 
        WHERE (due_date IS NULL OR due_date = '')
    """)
    
    invoices_missing_due_date = cursor.fetchall()
    print(f"\n📊 Found {len(invoices_missing_due_date)} invoices with missing due_date")
    
    # Step 2: Try to get due_date from JSON files first
    if os.path.exists(JSON_DIR):
        json_files = {f: os.path.join(JSON_DIR, f) for f in os.listdir(JSON_DIR) if f.endswith('.json')}
        print(f"   Found {len(json_files)} JSON files in output_jsons/")
    else:
        json_files = {}
        print(f"   ⚠️ JSON directory not found: {JSON_DIR}")
    
    for inv_id, inv_number, source_file, inv_date, current_due_date in invoices_missing_due_date:
        new_due_date = None
        source = None
        
        # Try to find matching JSON file
        if source_file:
            # Extract just the filename from source_file path
            json_filename = os.path.basename(source_file)
            if not json_filename.endswith('.json'):
                json_filename = json_filename.replace('.pdf', '.json')
            
            if json_filename in json_files:
                try:
                    with open(json_files[json_filename], 'r') as f:
                        json_data = json.load(f)
                        if json_data.get('due_date') and str(json_data['due_date']).strip():
                            new_due_date = json_data['due_date']
                            source = 'json'
                except Exception as e:
                    pass  # JSON read failed, will try to calculate
        
        # If no due_date from JSON, calculate from invoice_date
        if not new_due_date and inv_date:
            new_due_date = calculate_due_date(inv_date)
            if new_due_date:
                source = 'calculated'
        
        # Update database if we have a due_date
        if new_due_date:
            try:
                cursor.execute(
                    "UPDATE invoices SET due_date = ? WHERE id = ?",
                    (new_due_date, inv_id)
                )
                if source == 'json':
                    updated_from_json += 1
                else:
                    updated_calculated += 1
                print(f"   ✅ {inv_number}: {new_due_date} ({source})")
            except Exception as e:
                errors += 1
                print(f"   ❌ {inv_number}: Error updating - {e}")
        else:
            skipped += 1
            if inv_number and len(str(inv_number)) < 30:  # Don't spam with long filenames
                print(f"   ⚠️ {inv_number}: No date to calculate from")
    
    # Step 3: Also update invoices that have invoice_date but empty due_date
    # (in case they weren't in the first query due to NULL vs empty string)
    cursor.execute("""
        SELECT id, invoice_number, invoice_date 
        FROM invoices 
        WHERE invoice_date IS NOT NULL AND invoice_date != ''
        AND (due_date IS NULL OR due_date = '')
    """)
    remaining = cursor.fetchall()
    
    for inv_id, inv_number, inv_date in remaining:
        new_due_date = calculate_due_date(inv_date)
        if new_due_date:
            try:
                cursor.execute(
                    "UPDATE invoices SET due_date = ? WHERE id = ?",
                    (new_due_date, inv_id)
                )
                updated_calculated += 1
            except Exception as e:
                errors += 1
    
    # Commit changes
    conn.commit()
    
    # Summary
    print(f"\n📊 Backfill Summary:")
    print(f"   ✅ Updated from JSON: {updated_from_json}")
    print(f"   ✅ Calculated (+30 days): {updated_calculated}")
    print(f"   ⚠️ Skipped (no invoice_date): {skipped}")
    print(f"   ❌ Errors: {errors}")
    
    # Verify
    cursor.execute("SELECT COUNT(*) FROM invoices WHERE due_date IS NOT NULL AND due_date != ''")
    with_due_date = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM invoices")
    total = cursor.fetchone()[0]
    print(f"\n   📈 Invoices with due_date: {with_due_date}/{total}")
    
    conn.close()
    print("\n✅ Backfill complete!")

if __name__ == '__main__':
    main()

