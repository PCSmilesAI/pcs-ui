#!/usr/bin/env python3
"""
Republic Services Invoice Parser

Parses invoices from Republic Services (waste management/sanitation).
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
        r'Invoice Number\s*\n?\s*([\d-]+)',
        r'Invoice\s*#?\s*:?\s*([\d-]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    
    return None


def parse_invoice_date(text: str) -> Optional[str]:
    """Extract invoice date."""
    patterns = [
        r'Invoice Date\s*\n?\s*(\w+\s+\d{1,2},?\s+\d{4})',
        r'Invoice Date\s*\n?\s*(\d{2}/\d{2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            # Try to normalize
            try:
                # Handle "May 31, 2025" format
                dt = datetime.strptime(date_str.replace(',', ''), '%B %d %Y')
                return dt.strftime('%m/%d/%Y')
            except:
                pass
            return date_str
    
    return None


def parse_due_date(text: str) -> Optional[str]:
    """Extract payment due date."""
    patterns = [
        r'Payment Due Date\s*\n?\s*(\w+\s+\d{1,2},?\s+\d{4})',
        r'Due Date\s*\n?\s*(\d{2}/\d{2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            try:
                dt = datetime.strptime(date_str.replace(',', ''), '%B %d %Y')
                return dt.strftime('%m/%d/%Y')
            except:
                pass
            return date_str
    
    return None


def parse_total(text: str) -> Optional[str]:
    """Extract invoice total amount."""
    patterns = [
        r'Total Amount Due\s*\n?\s*\$?([\d,]+\.?\d*)',
        r'Current Invoice Charges\s*\n?\s*\$?([\d,]+\.?\d*)',
        r'Invoice Total\s*:?\s*\$?([\d,]+\.?\d*)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = match.group(1).replace(',', '')
            if float(amount) > 0:
                return amount
    
    return None


def parse_office_location(text: str) -> str:
    """Detect office location from address."""
    text_lower = text.lower()
    
    # Look for location in the customer address section
    for key, location in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return location
    
    return ''


def parse_line_items(text: str) -> List[Dict[str, Any]]:
    """Extract line items from invoice."""
    items = []
    
    # Republic Services format: Description, Reference, Quantity, Unit Price, Amount
    # Look for service descriptions
    patterns = [
        r'(\d+)\s+Trash Cart.*?\$([\d,]+\.?\d*)',
        r'Recycling.*?\$([\d,]+\.?\d*)',
        r'(\d+)\s+Gallon Cart Service.*?\$([\d,]+\.?\d*)',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            if len(match.groups()) == 2:
                qty, amount = match.groups()
            else:
                qty = '1'
                amount = match.group(1)
            
            items.append({
                'product_number': '',
                'product_name': match.group(0)[:80],
                'Quantity': qty,
                'unit_price': amount.replace(',', ''),
                'line_item_total': amount.replace(',', ''),
            })
    
    return items


def parse(pdf_path: str) -> Dict[str, Any]:
    """Main parsing function for Republic Services invoices."""
    text = extract_text(pdf_path)
    
    if not text.strip():
        raise RuntimeError("Could not extract text from PDF")
    
    # Verify this is a Republic Services invoice
    if 'republic' not in text.lower():
        raise RuntimeError("Not a Republic Services invoice")
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text)
    total = parse_total(text)
    office_location = parse_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Republic Services',
        'vendor_name': 'Republic Services',
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
    
    print(f"✅ Republic Services invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${total}")
    print(f"   Office: {office_location}")
    print(json.dumps(result, indent=2))
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 republic_services_parser.py <pdf_path>")
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


