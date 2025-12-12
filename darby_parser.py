#!/usr/bin/env python3
"""
Darby Dental Supply Invoice Parser

Parses Darby Dental Supply invoices (both digital and scanned).
Darby invoices typically contain:
- Invoice number (usually 7 digits)
- Customer number
- Ship To / Sold To addresses
- Line items with: Quantity, Product No, Size, Description, Unit Price, Extended Price
- Subtotal, Tax, Total
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


def is_scanned(pdf_path: str) -> bool:
    """Check if PDF is scanned (no extractable text)"""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        has_text = any(page.get_text().strip() for page in doc)
        doc.close()
        return not has_text
    except Exception:
        return True


def extract_text_digital(pdf_path: str) -> str:
    """Extract text from digital PDF"""
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


def extract_text_ocr(pdf_path: str) -> str:
    """Extract text using OCR for scanned PDFs"""
    try:
        import fitz
        import pytesseract
        from PIL import Image
        
        doc = fitz.open(pdf_path)
        texts = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            texts.append(pytesseract.image_to_string(img))
        doc.close()
        return '\n'.join(texts)
    except Exception as e:
        print(f"⚠️ OCR error: {e}")
        return ""


def clean_office_location(text: str) -> str:
    """Extract office location from address text"""
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
    """Extract invoice number from text"""
    # Darby invoice numbers are typically 7 digits
    patterns = [
        r'Invoice\s*N[oc]?\s*[:\s]*(\d{7})',
        r'Invoice\s*#?\s*(\d{7})',
        r'INV[#:\s]*(\d{7})',
        r'\b(\d{7})\b(?=\s*$)',  # 7 digits at end of line
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1)
    
    # Fallback: look for any 7-digit number that looks like an invoice
    matches = re.findall(r'\b(\d{7})\b', text)
    if matches:
        # Return the first one that's not a date or phone number
        for m in matches:
            if not m.startswith('20') and not m.startswith('19'):  # Not a year
                return m
    
    return ""


def parse_invoice_date(text: str) -> str:
    """Extract invoice date"""
    patterns = [
        r'Invoice\s*Date[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'Date[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract invoice total"""
    patterns = [
        r'(?:Total|ita)\s*\$?\s*([\d,]+\.\d{2})',
        r'Invoice\s*Total\s*\$?\s*([\d,]+\.\d{2})',
        r'Amount\s*Due\s*\$?\s*([\d,]+\.\d{2})',
        r'Balance\s*Due\s*\$?\s*([\d,]+\.\d{2})',
        r'Subtotal\s*\$?\s*([\d,]+\.\d{2})',
    ]
    
    totals = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            val = float(m.replace(',', ''))
            totals.append(val)
    
    # Return the largest value (likely the grand total)
    if totals:
        return str(max(totals))
    
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract line items from invoice"""
    items = []
    lines = text.split('\n')
    
    # Pattern for line items: Qty [Msg] ProductNo [Size] Description UnitPrice ExtPrice
    item_pattern = re.compile(
        r'(\d+)\s*'  # Quantity
        r'(?:[A-Z\*]+\s+)?'  # Optional message code
        r'(\d{7}|\d{5,8})\s*'  # Product number
        r'(?:\|[^|]+\|)?\s*'  # Optional size in pipes
        r'([A-Za-z].+?)\s+'  # Description
        r'(\d+\.\d{2})\s+'  # Unit price
        r'(\d+\.\d{2})'  # Extended price
    )
    
    # Alternative pattern for OCR'd text
    simple_pattern = re.compile(
        r'(\d+)\s+.*?'  # Quantity
        r'(\d+\.\d{2})\s+'  # Unit price
        r'(\d+\.\d{2})'  # Extended price
    )
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        match = item_pattern.search(line)
        if match:
            items.append({
                'product_number': match.group(2),
                'product_name': match.group(3).strip(),
                'Quantity': match.group(1),
                'unit_price': match.group(4),
                'line_item_total': match.group(5)
            })
        else:
            # Try simpler pattern for OCR'd text
            simple_match = simple_pattern.search(line)
            if simple_match and len(line) > 20:
                # Extract product number if present
                prod_match = re.search(r'\b(\d{7})\b', line)
                items.append({
                    'product_number': prod_match.group(1) if prod_match else '',
                    'product_name': line[:50].strip(),
                    'Quantity': simple_match.group(1),
                    'unit_price': simple_match.group(2),
                    'line_item_total': simple_match.group(3)
                })
    
    return items


def calculate_due_date(invoice_date: str) -> str:
    """Calculate due date (invoice date + 30 days)"""
    if not invoice_date:
        return ""
    
    try:
        # Try different date formats
        for fmt in ['%m/%d/%Y', '%m/%d/%y', '%m-%d-%Y', '%m-%d-%y']:
            try:
                dt = datetime.strptime(invoice_date, fmt)
                due = dt + timedelta(days=30)
                return due.strftime('%m/%d/%Y')
            except ValueError:
                continue
    except Exception:
        pass
    
    return ""


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function for Darby invoices"""
    
    # Extract text
    if is_scanned(pdf_path):
        print("📷 Scanned PDF detected, using OCR...")
        text = extract_text_ocr(pdf_path)
    else:
        text = extract_text_digital(pdf_path)
    
    if not text.strip():
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None
    
    # Verify this is a Darby invoice
    if 'darby' not in text.lower() and 'darbydental' not in text.lower():
        print(f"⚠️ Not a Darby invoice: {pdf_path}")
        return None
    
    # Extract fields
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    invoice_total = parse_invoice_total(text)
    due_date = calculate_due_date(invoice_date)
    
    # Extract office location from Ship To section
    ship_to_match = re.search(r'Ship\s*To[:\s]*(.*?)(?:Customer|Invoice|Quantity)', text, re.DOTALL | re.IGNORECASE)
    office_location = ""
    if ship_to_match:
        office_location = clean_office_location(ship_to_match.group(1))
    
    # If no office found in Ship To, try the whole text
    if not office_location:
        office_location = clean_office_location(text)
    
    # Parse line items
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Darby Dental',
        'vendor_name': 'Darby Dental Supply',
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
    
    print(f"✅ Darby invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}")
    print(f"   Line items: {len(line_items)}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 darby_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)

