#!/usr/bin/env python3
"""
Comcast Business Invoice Parser

Parses Comcast Business invoices for internet/phone services.
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
    """Extract invoice/account number"""
    patterns = [
        r'Invoice\s*#?\s*[:\s]*(\d+)',
        r'Account\s*Number[:\s]*(\d[\d\-]+)',
        r'Reference[:\s]*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_invoice_date(text: str) -> str:
    """Extract billing date"""
    patterns = [
        r'Bill\s*Date[:\s]*(\w+\s+\d{1,2},?\s+\d{4})',
        r'Statement\s*Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            try:
                for fmt in ['%B %d, %Y', '%B %d %Y', '%m/%d/%Y']:
                    try:
                        dt = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', ''))
                        return dt.strftime('%m/%d/%Y')
                    except ValueError:
                        continue
            except Exception:
                pass
            return date_str
    return ""


def parse_due_date(text: str) -> str:
    """Extract due date"""
    patterns = [
        r'Due\s*Date[:\s]*(\w+\s+\d{1,2},?\s+\d{4})',
        r'Payment\s*Due[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'Due[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            try:
                for fmt in ['%B %d, %Y', '%B %d %Y', '%m/%d/%Y']:
                    try:
                        dt = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', ''))
                        return dt.strftime('%m/%d/%Y')
                    except ValueError:
                        continue
            except Exception:
                pass
            return date_str
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract total amount due"""
    patterns = [
        r'Total\s*Amount\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Amount\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Total\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Balance\s*Due\s*\$?([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).replace(',', '')
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract service line items"""
    items = []
    
    # Look for service descriptions with amounts
    pattern = re.compile(
        r'(Internet|Voice|Phone|TV|Business|Service).+?\$([\d,]+\.\d{2})',
        re.IGNORECASE
    )
    
    for match in pattern.finditer(text):
        items.append({
            'product_number': '',
            'product_name': match.group(0).split('$')[0].strip(),
            'Quantity': '1',
            'unit_price': match.group(2).replace(',', ''),
            'line_item_total': match.group(2).replace(',', ''),
        })
    
    return items


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function"""
    text = extract_text(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    if 'comcast' not in text.lower():
        print(f"⚠️ Not a Comcast invoice: {pdf_path}")
        return None
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text)
    invoice_total = parse_invoice_total(text)
    office_location = clean_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Comcast',
        'vendor_name': 'Comcast Business',
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
    
    print(f"✅ Comcast invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 comcast_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)





