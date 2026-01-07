#!/usr/bin/env python3
"""
A-1 Professional Exterminating Invoice Parser

Parses pest control service invoices from A-1 Professional Exterminating.
Invoices typically contain:
- Invoice number
- Account number  
- Invoice date and due date
- Service line items
- Total amount due
"""

import os
import sys
import re
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

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
        r'INVOICE NO\.?\s*(\d+)',
        r'Invoice\s*#?\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_invoice_date(text: str) -> str:
    """Extract invoice date"""
    patterns = [
        r'INVOICE DATE\s*(\d{1,2}/\d{1,2}/\d{4})',
        r'Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_due_date(text: str) -> str:
    """Extract due date"""
    patterns = [
        r'DUE DATE.*?(\d{1,2}/\d{1,2}/\d{4})',
        r'Due\s*Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1)
    
    # Check for "Upon Receipt"
    if 'upon receipt' in text.lower():
        return 'Upon Receipt'
    
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract invoice total"""
    patterns = [
        r'Amount\s*Due\s*\$?([\d,]+\.\d{2})',
        r'AMOUNT DUE\s*\$?([\d,]+\.\d{2})',
        r'Total\s*\$?([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return matches[-1].replace(',', '')
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract service line items"""
    items = []
    
    # Pattern: ITEM QUANTITY PRICE SUBTOTAL
    pattern = re.compile(
        r'^(.+?)\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$',
        re.MULTILINE
    )
    
    for match in pattern.finditer(text):
        items.append({
            'product_number': '',
            'product_name': match.group(1).strip(),
            'Quantity': match.group(2),
            'unit_price': match.group(3).replace(',', ''),
            'line_item_total': match.group(4).replace(',', ''),
        })
    
    # Simpler pattern for single-item invoices
    if not items:
        simple_pattern = re.compile(
            r'ITEM\s+QUANTITY\s+PRICE.*?\n(.+?)\s+(\d+)\s+\$([\d.]+)',
            re.IGNORECASE | re.DOTALL
        )
        match = simple_pattern.search(text)
        if match:
            items.append({
                'product_number': '',
                'product_name': match.group(1).strip(),
                'Quantity': match.group(2),
                'unit_price': match.group(3),
                'line_item_total': match.group(3),
            })
    
    return items


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function"""
    text = extract_text(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    # Verify this is an A-1 Professional invoice
    if not any(x in text.lower() for x in ['a-1 professional', 'aoneprofessional']):
        print(f"⚠️ Not an A-1 Professional invoice: {pdf_path}")
        return None
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text)
    invoice_total = parse_invoice_total(text)
    office_location = clean_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'A-1 Professional',
        'vendor_name': 'A-1 Professional Exterminating',
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
    
    print(f"✅ A-1 Professional invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}, Items: {len(line_items)}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 a1_professional_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)







