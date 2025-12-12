#!/usr/bin/env python3
"""
Clipboard Health Invoice Parser

Parses invoices and credit notes from Clipboard Health (healthcare staffing).
"""

import os
import sys
import re
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_DIR = os.path.join(DATA_DIR, 'output_jsons')

# Office locations for matching
OFFICE_LOCATIONS = {
    'roseburg': 'Roseburg',
    'lebanon': 'Lebanon',
    'ridgefield': 'Ridgefield',
    'milwaukie': 'Milwaukie',
    'columbia': 'Columbia',
    'salem': 'Salem',
    'eugene': 'Eugene',
    'vancouver': 'Vancouver',
    'snohomish': 'Snohomish',
    'longview': 'Longview',
    'hazel dell': 'Hazel Dell',
    '15th st': 'Vancouver',
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
    """Extract invoice/credit note number."""
    patterns = [
        r'CREDIT NOTE\s*\n?\s*(CN-\d+)',
        r'Invoice\s*#?\s*:?\s*(\d+-\d+)',
        r'Invoice\s*#?\s*:?\s*(\d{6,})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None


def parse_invoice_date(text: str) -> Optional[str]:
    """Extract invoice date."""
    patterns = [
        r'Date:\s*\n?\s*(\d{2}/\d{2}/\d{4})',
        r'Invoice Date\s*:?\s*(\d{2}/\d{2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    # Look for MM/DD/YYYY format anywhere
    match = re.search(r'(\d{2}/\d{2}/\d{4})', text)
    if match:
        return match.group(1)
    
    return None


def parse_total(text: str) -> Optional[str]:
    """Extract invoice total amount."""
    patterns = [
        r'Total:\s*\n?\s*\$?([\d,]+\.?\d*)',
        r'Amount\s*\n?\s*\$?([\d,]+\.\d{2})',
        r'\$([\d,]+\.\d{2})\s*$',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
        if match:
            amount = match.group(1).replace(',', '')
            if float(amount) > 0:
                return amount
    
    return None


def parse_office_location(text: str) -> str:
    """Detect office location from address."""
    text_lower = text.lower()
    
    # Look for location in "Bill To" section
    bill_match = re.search(r'Bill To:(.*?)(?:Account|Date|$)', text, re.DOTALL | re.IGNORECASE)
    if bill_match:
        bill_text = bill_match.group(1).lower()
        for key, location in OFFICE_LOCATIONS.items():
            if key in bill_text:
                return location
    
    # Fallback to full text search
    for key, location in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return location
    
    return ''


def parse_line_items(text: str) -> List[Dict[str, Any]]:
    """Extract line items from invoice."""
    items = []
    
    # Pattern for Clipboard Health line items
    item_pattern = r'([A-Za-z\s]+(?:on invoice|payment).*?)\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})'
    
    for match in re.finditer(item_pattern, text, re.IGNORECASE):
        desc = match.group(1).strip()
        qty = match.group(2)
        unit = match.group(3).replace(',', '')
        total = match.group(4).replace(',', '')
        
        items.append({
            'product_number': '',
            'product_name': desc[:100],
            'Quantity': qty,
            'unit_price': unit,
            'line_item_total': total,
        })
    
    # Simpler pattern for single-line items
    if not items:
        simple_pattern = r'([A-Za-z\s]+)\s+\d+\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})'
        for match in re.finditer(simple_pattern, text):
            items.append({
                'product_number': '',
                'product_name': match.group(1).strip()[:100],
                'Quantity': '1',
                'unit_price': match.group(2).replace(',', ''),
                'line_item_total': match.group(3).replace(',', ''),
            })
    
    return items


def parse(pdf_path: str) -> Dict[str, Any]:
    """Main parsing function for Clipboard Health invoices."""
    text = extract_text(pdf_path)
    
    if not text.strip():
        raise RuntimeError("Could not extract text from PDF")
    
    # Verify this is a Clipboard Health invoice
    if 'clipboard' not in text.lower():
        raise RuntimeError("Not a Clipboard Health invoice")
    
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
        'vendor': 'Clipboard Health',
        'vendor_name': 'Clipboard Health',
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
    
    print(f"✅ Clipboard Health invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${total}")
    print(f"   Office: {office_location}")
    print(json.dumps(result, indent=2))
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 clipboard_health_parser.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)
    
    try:
        parse(pdf_path)
    except Exception as e:
        print(f"Error parsing invoice: {e}", file=sys.stderr)
        sys.exit(1)

