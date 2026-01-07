#!/usr/bin/env python3
"""
Dandy Dental Lab Invoice Parser

Parses Dandy dental lab invoices (digital format).
Dandy invoices typically contain:
- Invoice number (format: #XXXXX-XXXX-XXX)
- Date of issue and due date
- Lab work line items with: Date, Description, Doctor, Price
- Total balance
"""

import os
import sys
import re
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_DIR = os.path.join(DATA_DIR, "output_jsons")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Office location mapping
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


def load_office_map():
    """Load office mapping from office_info.json"""
    office_map = {}
    possible_paths = [
        os.path.join(os.path.dirname(__file__), 'pcs_ui_data', 'office_info.json'),
        os.path.join(os.path.dirname(__file__), 'public', 'office_info.json'),
        '/var/www/pcs-ui/pcs_ui_data/office_info.json',
        '/var/www/pcs-ui/public/office_info.json',
    ]

    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    offices = json.load(f)
                    for office in offices:
                        name = office.get('name', '').strip().lower()
                        address = office.get('address', '').strip().lower()
                        if name:
                            office_map[name] = office['name']
                        if address:
                            office_map[address] = office['name']
                    return office_map
            except Exception:
                continue
    return {}


OFFICE_MAP = load_office_map()


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
    
    # Check against known offices
    for key, name in OFFICE_LOCATIONS.items():
        if key in text_lower:
            return name
    
    # Check against loaded office map
    for key, name in OFFICE_MAP.items():
        if key in text_lower:
            return name
    
    return ""


def parse_invoice_number(text: str) -> str:
    """Extract Dandy invoice number"""
    # Dandy format: #32257-9405-049
    patterns = [
        r'Invoice\s*number\s*#?(\d+-\d+-\d+)',
        r'#(\d{5}-\d{4}-\d{3})',
        r'Invoice\s*#(\d+-\d+-\d+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return ""


def parse_date(text: str, label: str) -> str:
    """Extract date by label"""
    patterns = [
        rf'{label}\s*(\w+\s+\d{{1,2}},?\s+\d{{4}})',
        rf'{label}\s*(\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            # Try to normalize to MM/DD/YYYY
            try:
                for fmt in ['%B %d, %Y', '%B %d %Y', '%m/%d/%Y', '%m/%d/%y', '%m-%d-%Y']:
                    try:
                        dt = datetime.strptime(date_str, fmt)
                        return dt.strftime('%m/%d/%Y')
                    except ValueError:
                        continue
            except Exception:
                pass
            return date_str
    
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract invoice total"""
    patterns = [
        r'Total\s*balance\s*\$?([\d,]+\.\d{2})',
        r'\$([\d,]+\.\d{2})\s*USD\s*due',
        r'Total\s*\$?([\d,]+\.\d{2})',
        r'Amount\s*Due\s*\$?([\d,]+\.\d{2})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).replace(',', '')
    
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract lab work line items from Dandy invoice"""
    items = []
    
    # Dandy invoices have sections like:
    # MM/DD/YY
    # Patient Name
    # Doctor Name
    # $XXX.XX
    # $X.XX (tax)
    # $XXX.XX (total)
    # Item descriptions follow
    
    # Pattern for date entries
    date_pattern = r'(\d{2}/\d{2}/\d{2})\s*\n\s*([A-Za-z][A-Za-z\s]+)\s*\n\s*([A-Za-z][A-Za-z\s]+)\s*\n\s*\$([\d,]+\.\d{2})'
    
    matches = re.findall(date_pattern, text)
    for match in matches:
        date, patient, doctor, price = match
        items.append({
            'product_number': '',
            'product_name': f"Lab work for {patient.strip()}",
            'description': f"Doctor: {doctor.strip()}",
            'Quantity': '1',
            'unit_price': price.replace(',', ''),
            'line_item_total': price.replace(',', ''),
            'service_date': date,
        })
    
    # Also look for individual service line items
    # Format: ServiceName $XX.XX or $XX.XX
    service_pattern = r'^([A-Za-z][A-Za-z\s\-\d]+)\s*\$([\d,]+\.\d{2})$'
    lines = text.split('\n')
    
    for line in lines:
        line = line.strip()
        match = re.match(service_pattern, line)
        if match:
            service_name = match.group(1).strip()
            price = match.group(2).replace(',', '')
            
            # Skip if this is a summary line
            skip_words = ['total', 'balance', 'subtotal', 'tax', 'sales']
            if any(skip in service_name.lower() for skip in skip_words):
                continue
            
            # Skip if price is 0
            if float(price) == 0:
                continue
                
            items.append({
                'product_number': '',
                'product_name': service_name,
                'Quantity': '1',
                'unit_price': price,
                'line_item_total': price,
            })
    
    return items


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function for Dandy invoices"""
    
    text = extract_text(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    # Verify this is a Dandy invoice
    if 'dandy' not in text.lower() and 'meetdandy' not in text.lower():
        print(f"⚠️ Not a Dandy invoice: {pdf_path}")
        return None
    
    # Extract fields
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_date(text, 'Date of issue')
    due_date = parse_date(text, 'Date due')
    invoice_total = parse_invoice_total(text)
    
    # Extract office location
    office_location = clean_office_location(text)
    
    # Also check the billing address for office
    if not office_location:
        # Look for Smiles Dental Services or Pacific Crest pattern
        office_match = re.search(r'(?:Smiles Dental Services|Pacific Crest Smiles?)\s*[–-]?\s*(\w+)', text, re.IGNORECASE)
        if office_match:
            office_location = office_match.group(1).capitalize()
    
    # Parse line items
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Dandy',
        'vendor_name': 'Dandy Dental Lab',
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'due_date': due_date,
        'invoice_total': invoice_total,
        'office_location': office_location,
        'line_items': line_items,
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now(timezone.utc).isoformat(),
    }
    
    # Save to output_jsons
    outpath = os.path.join(OUTPUT_DIR, Path(pdf_path).stem + ".json")
    with open(outpath, "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"✅ Dandy invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Due: {due_date}")
    print(f"   Total: ${invoice_total}")
    print(f"   Office: {office_location}")
    print(f"   Line items: {len(line_items)}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 dandy_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)







