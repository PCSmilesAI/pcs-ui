#!/usr/bin/env python3
"""
Brasseler USA Dental Invoice Parser

Parses Brasseler dental supply invoices.
Brasseler invoices typically contain:
- Invoice number (7 digits)
- Customer number
- Ship To / Bill To addresses
- Line items with: Item, Description, Qty, Unit Price, Extended Amount
- Subtotal, Shipping, Total
"""

import os
import sys
import re
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_DIR = os.path.join(DATA_DIR, "output_jsons")
os.makedirs(OUTPUT_DIR, exist_ok=True)

OFFICE_LOCATIONS = {
    'milwaukie': 'Milwaukie',
    'eugene': 'Eugene',
    'roseburg': 'Roseburg',
    'salem': 'Salem',
    'lebanon': 'Lebanon',
    'ridgefield': 'Ridgefield',
    'vancouver': 'Vancouver',
    'columbia': 'Columbia City',
}


def extract_text(pdf_path: str) -> str:
    """Extract text from PDF"""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception:
        return ""


def clean_office_location(text: str) -> str:
    """Extract office location from text"""
    text_lower = text.lower()
    for key, name in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return name
    return ""


def parse_invoice_number(text: str) -> str:
    """Extract invoice number"""
    patterns = [
        r'Invoice\s*#?\s*(\d{7})',
        r'Invoice\s*\n\s*(\d{7})',
        r'^(\d{7})$',  # 7 digit number on its own line
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1)
    
    # Look in the structured data section
    match = re.search(r'(\d{7})\s*\n.*?(?:SMILES|Pacific)', text)
    if match:
        return match.group(1)
    
    return ""


def parse_invoice_date(text: str) -> str:
    """Extract invoice/ship date"""
    patterns = [
        r'Date Shipped\s*\n?\s*(\d{1,2}/\d{1,2}/\d{2,4})',
        r'Ship.*?(\d{1,2}/\d{1,2}/\d{2,4})',
        r'(\d{1,2}/\d{1,2}/\d{2})\s*$',  # Date at end of line
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1)
    return ""


def parse_due_date(text: str, invoice_date: str) -> str:
    """Extract or calculate due date"""
    # Look for explicit due date
    patterns = [
        r'Payment Due\s*\n?\s*(\d{1,2}/\d{1,2}/\d{2,4})',
        r'Due\s*Date\s*\n?\s*(\d{1,2}/\d{1,2}/\d{2,4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    # Check for Net 30 terms
    if 'net 30' in text.lower() and invoice_date:
        try:
            for fmt in ['%m/%d/%Y', '%m/%d/%y']:
                try:
                    dt = datetime.strptime(invoice_date, fmt)
                    due = dt + timedelta(days=30)
                    return due.strftime('%m/%d/%Y')
                except ValueError:
                    continue
        except Exception:
            pass
    
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract invoice total"""
    patterns = [
        r'TOTAL:\s*\n?\s*\$?\s*([\d,]+\.\d{2})',
        r'Total\s*\$?\s*([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return matches[-1].replace(',', '')
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract line items"""
    items = []
    
    # Pattern for Brasseler line items
    # Item code, qty ordered, qty shipped, unit price, discount, extended
    pattern = re.compile(
        r'(\d{6}[A-Z]\d)\s+'  # Item code like 001107U0
        r'(\d+)\s+'  # Qty ordered
        r'(\d+)\s+'  # Qty shipped
        r'([\d.]+)\s+'  # Unit price
        r'([\d.]+)\s+'  # Discount %
        r'([\d.]+)\s*'  # Sell price
        r'([A-Z]+)\s*'  # UOM
        r'(.+?)\s+'  # Description
        r'(\d+)\s+'  # Backorder
        r'([\d.]+)'  # Extended
    )
    
    for match in pattern.finditer(text):
        items.append({
            'product_number': match.group(1),
            'product_name': match.group(8).strip(),
            'Quantity': match.group(3),
            'unit_price': match.group(6),
            'line_item_total': match.group(10)
        })
    
    # Simpler fallback pattern
    if not items:
        simple_pattern = re.compile(r'(\d{6}[A-Z]\d)\s+.*?(\d+\.\d{2})\s*$', re.MULTILINE)
        for match in simple_pattern.finditer(text):
            items.append({
                'product_number': match.group(1),
                'product_name': '',
                'Quantity': '1',
                'unit_price': match.group(2),
                'line_item_total': match.group(2)
            })
    
    return items


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function"""
    text = extract_text(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    if 'brasseler' not in text.lower():
        print(f"⚠️ Not a Brasseler invoice: {pdf_path}")
        return None
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text, invoice_date)
    invoice_total = parse_invoice_total(text)
    office_location = clean_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Brasseler',
        'vendor_name': 'Brasseler USA Dental',
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'due_date': due_date,
        'invoice_total': invoice_total,
        'office_location': office_location,
        'line_items': line_items,
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now(timezone.utc).isoformat(),
    }
    
    outpath = os.path.join(OUTPUT_DIR, Path(pdf_path).stem + ".json")
    with open(outpath, "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"✅ Brasseler invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}, Items: {len(line_items)}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 brasseler_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)

