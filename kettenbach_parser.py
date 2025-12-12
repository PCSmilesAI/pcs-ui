#!/usr/bin/env python3
"""
Kettenbach LP Invoice Parser

Parses invoices from Kettenbach LP (dental impression materials supplier).
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
    patterns = [
        r'Invoice Number:\s*\n?\s*(\d+)',
        r'Invoice\s*#?\s*:?\s*(\d{6,})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    # Kettenbach format: Invoice Number is on its own line after "Invoice Number:"
    # Look for 6-digit number that appears after invoice-related headers
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'invoice number' in line.lower():
            # Check next few lines for the number
            for j in range(i, min(i+5, len(lines))):
                match = re.search(r'^\s*(\d{6})\s*$', lines[j])
                if match:
                    return match.group(1)
    
    return None


def parse_invoice_date(text: str) -> Optional[str]:
    """Extract invoice date."""
    patterns = [
        r'Invoice Date:\s*\n?\s*(\d{2}-\d{2}-\d{4})',
        r'Invoice Date:\s*\n?\s*(\d{2}/\d{2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            # Normalize to MM/DD/YYYY
            if '-' in date_str:
                date_str = date_str.replace('-', '/')
            return date_str
    
    # Kettenbach format: date is on its own line after "Invoice Date:"
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'invoice date' in line.lower():
            # Check next few lines for the date
            for j in range(i, min(i+5, len(lines))):
                match = re.search(r'(\d{2}-\d{2}-\d{4})', lines[j])
                if match:
                    return match.group(1).replace('-', '/')
    
    return None


def parse_due_date(text: str) -> Optional[str]:
    """Extract due date."""
    patterns = [
        r'Due Date\s*\n?\s*(\d{2}-\d{2}-\d{4})',
        r'Due Date\s*\n?\s*(\d{2}/\d{2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            if '-' in date_str:
                date_str = date_str.replace('-', '/')
            return date_str
    
    return None


def parse_total(text: str) -> Optional[str]:
    """Extract invoice total amount."""
    patterns = [
        r'Invoice Total:\s*\n?\s*\$?([\d,]+\.\d{2})',
        r'Amount Due:\s*\n?\s*\$?([\d,]+\.\d{2})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = match.group(1).replace(',', '')
            if float(amount) > 0:
                return amount
    
    # Kettenbach format: total is on its own line after "Invoice Total:"
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'invoice total' in line.lower():
            # Check next few lines for the amount
            for j in range(i, min(i+5, len(lines))):
                match = re.search(r'\$([\d,]+\.\d{2})', lines[j])
                if match:
                    return match.group(1).replace(',', '')
    
    return None


def parse_office_location(text: str) -> str:
    """Detect office location from shipping address."""
    text_lower = text.lower()
    
    # Look in "Shipped To" section
    ship_match = re.search(r'Shipped To:(.*?)(?:Billed To:|Invoice|$)', text, re.DOTALL | re.IGNORECASE)
    if ship_match:
        ship_text = ship_match.group(1).lower()
        for key, location in OFFICE_LOCATIONS.items():
            if key in ship_text:
                return location
    
    # Fallback to full text search
    for key, location in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return location
    
    return ''


def parse_line_items(text: str) -> List[Dict[str, Any]]:
    """Extract line items from invoice."""
    items = []
    
    # Pattern for Kettenbach line items: Qty, Description, Unit Price, Line Price
    # Example: "10 SHP: 10 Futar Fast Normal Pack Cart   $44.00   $440.00"
    item_pattern = r'^\s*(\d+)\s+(SHP:.*?)\s+\$([\d,]+\.?\d*)\s+\$([\d,]+\.?\d*)'
    
    for match in re.finditer(item_pattern, text, re.MULTILINE):
        qty = match.group(1)
        desc = match.group(2).strip()
        unit_price = match.group(3).replace(',', '')
        line_total = match.group(4).replace(',', '')
        
        # Skip free items
        if float(line_total) > 0:
            items.append({
                'product_number': '',
                'product_name': desc[:100],  # Truncate long descriptions
                'Quantity': qty,
                'unit_price': unit_price,
                'line_item_total': line_total,
            })
    
    return items


def parse(pdf_path: str) -> Dict[str, Any]:
    """Main parsing function for Kettenbach invoices."""
    text = extract_text(pdf_path)
    
    if not text.strip():
        raise RuntimeError("Could not extract text from PDF")
    
    # Verify this is a Kettenbach invoice
    if 'kettenbach' not in text.lower():
        raise RuntimeError("Not a Kettenbach invoice")
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text)
    total = parse_total(text)
    office_location = parse_office_location(text)
    line_items = parse_line_items(text)
    
    # If no due date found, calculate from invoice date (Net 15)
    if not due_date and invoice_date:
        try:
            dt = datetime.strptime(invoice_date, '%m/%d/%Y')
            due_dt = dt + timedelta(days=15)
            due_date = due_dt.strftime('%m/%d/%Y')
        except:
            pass
    
    result = {
        'vendor': 'Kettenbach LP',
        'vendor_name': 'Kettenbach LP',
        'invoice_number': invoice_number or '',
        'invoice_date': invoice_date or '',
        'due_date': due_date or '',
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
    
    print(f"✅ Kettenbach invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${total}")
    print(f"   Office: {office_location}")
    print(f"   Line items: {len(line_items)}")
    print(json.dumps(result, indent=2))
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 kettenbach_parser.py <pdf_path>")
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

