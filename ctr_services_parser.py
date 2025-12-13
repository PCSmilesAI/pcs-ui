#!/usr/bin/env python3
"""
CTR Services / Property Management Statement Parser

Parses CTR Services Northwest / Campbell Commercial Real Estate statements.
These are typically rent/CAM statements with:
- Statement date
- Line items for rent, CAM charges, reconciliations
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


def parse_statement_date(text: str) -> str:
    """Extract statement date"""
    patterns = [
        r'STATEMENT AS OF\s+(\w+\s+\d{1,2},?\s+\d{4})',
        r'Statement\s*Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'Date[:\s]*(\w+\s+\d{1,2},?\s+\d{4})',
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


def parse_total(text: str) -> str:
    """Extract total amount due"""
    patterns = [
        r'TOTAL AMOUNT DUE\s*\$?([\d,]+\.\d{2})',
        r'Total\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Amount\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Balance\s*Due\s*\$?([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).replace(',', '')
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract line items from statement"""
    items = []
    
    # Pattern: DATE DESCRIPTION TIME_PERIOD AMOUNT BALANCE
    pattern = re.compile(
        r'(\d{2}\s+[A-Z]{3})\s+'  # Date like "01 NOV"
        r'([A-Z]+)\s+'  # Description like "RENT" or "CAM"
        r'(.+?)\s+'  # Time period
        r'\$([\d,]+\.\d{2})'  # Amount
    )
    
    for match in pattern.finditer(text):
        items.append({
            'product_number': '',
            'product_name': f"{match.group(2)} - {match.group(3).strip()}",
            'Quantity': '1',
            'unit_price': match.group(4).replace(',', ''),
            'line_item_total': match.group(4).replace(',', ''),
            'service_date': match.group(1),
        })
    
    return items


def generate_invoice_number(text: str, pdf_path: str) -> str:
    """Generate invoice number from statement"""
    # CTR statements don't have traditional invoice numbers
    # Generate one from date and address
    date_match = re.search(r'(\w+)\s+(\d{4})', text)
    if date_match:
        month = date_match.group(1)[:3].upper()
        year = date_match.group(2)
        return f"CTR-{month}{year}"
    
    # Fallback to filename
    return Path(pdf_path).stem[:20]


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function"""
    text = extract_text(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    # Verify this is a CTR/Campbell statement
    if not any(x in text.lower() for x in ['ctr services', 'campbell', 'campbellre']):
        print(f"⚠️ Not a CTR Services statement: {pdf_path}")
        return None
    
    invoice_number = generate_invoice_number(text, pdf_path)
    invoice_date = parse_statement_date(text)
    invoice_total = parse_total(text)
    office_location = clean_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'CTR Services',
        'vendor_name': 'CTR Services Northwest / Campbell Commercial',
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'due_date': '',  # Statements typically due upon receipt
        'invoice_total': invoice_total,
        'office_location': office_location,
        'line_items': line_items,
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now(timezone.utc).isoformat(),
    }
    
    outpath = os.path.join(OUTPUT_DIR, Path(pdf_path).stem + ".json")
    with open(outpath, "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"✅ CTR Services statement parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}, Items: {len(line_items)}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 ctr_services_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)



