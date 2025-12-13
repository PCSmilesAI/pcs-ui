#!/usr/bin/env python3
"""
Crystal Falls Water/Dental Lab Invoice Parser

Parses invoices from Crystal Falls (water delivery service).
"""

import os
import sys
import re
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
OUTPUT_DIR = os.path.join(DATA_DIR, 'output_jsons')

OFFICE_LOCATIONS = {
    'roseburg': 'Roseburg',
    'lebanon': 'Lebanon',
    'ridgefield': 'Ridgefield',
    'milwaukie': 'Milwaukie',
    'columbia': 'Columbia',
    'salem': 'Salem',
    'eugene': 'Eugene',
    'vancouver': 'Vancouver',
    'riddle': 'Riddle',
    'longview': 'Longview',
}


def extract_text(pdf_path: str) -> str:
    """Extract text from PDF."""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text = ''
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception as e:
        print(f"Error extracting text: {e}", file=sys.stderr)
        return ''


def parse_invoice_number(text: str) -> Optional[str]:
    """Extract invoice number."""
    match = re.search(r'Invoice\s*#\s*(\d+)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def parse_invoice_date(text: str) -> Optional[str]:
    """Extract invoice date."""
    # Format: Mon, Sep 08 2025
    match = re.search(r'(\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4})', text)
    if match:
        date_str = match.group(1).replace(',', '')
        try:
            dt = datetime.strptime(date_str, '%a %b %d %Y')
            return dt.strftime('%m/%d/%Y')
        except:
            pass
    return None


def parse_total(text: str) -> Optional[str]:
    """Extract invoice total."""
    patterns = [
        r'INVOICE TOTAL\s*\$?([\d,]+\.?\d*)',
        r'Total\s*:?\s*\$?([\d,]+\.?\d*)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).replace(',', '')
    return None


def parse_office_location(text: str) -> str:
    """Detect office location."""
    text_lower = text.lower()
    for key, location in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return location
    return ''


def parse_line_items(text: str) -> List[Dict[str, Any]]:
    """Extract line items."""
    items = []
    
    # Pattern: Item description, Qty @ Price, Amount
    pattern = r'([A-Za-z0-9\s]+?)\s+(\d+)\s*@\s*([\d.]+)\s+([\d.]+)'
    
    for match in re.finditer(pattern, text):
        items.append({
            'product_number': '',
            'product_name': match.group(1).strip(),
            'Quantity': match.group(2),
            'unit_price': match.group(3),
            'line_item_total': match.group(4),
        })
    
    return items


def parse(pdf_path: str) -> Dict[str, Any]:
    """Main parsing function."""
    text = extract_text(pdf_path)
    
    if not text.strip():
        raise RuntimeError("Could not extract text from PDF")
    
    if 'crystal falls' not in text.lower():
        raise RuntimeError("Not a Crystal Falls invoice")
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    total = parse_total(text)
    office_location = parse_office_location(text)
    line_items = parse_line_items(text)
    
    # Calculate due date (Net 30)
    due_date = ''
    if invoice_date:
        try:
            dt = datetime.strptime(invoice_date, '%m/%d/%Y')
            due_dt = dt + timedelta(days=30)
            due_date = due_dt.strftime('%m/%d/%Y')
        except:
            pass
    
    result = {
        'vendor': 'Crystal Falls',
        'vendor_name': 'Crystal Falls',
        'invoice_number': invoice_number or '',
        'invoice_date': invoice_date or '',
        'due_date': due_date,
        'invoice_total': total or '',
        'office_location': office_location,
        'line_items': line_items,
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now(timezone.utc).isoformat(),
    }
    
    # Write output JSON
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    output_path = os.path.join(OUTPUT_DIR, f"{base_name}.json")
    
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)
    
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 crystal_falls_parser.py <pdf_path>")
        sys.exit(1)
    
    try:
        parse(sys.argv[1])
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

