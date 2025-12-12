#!/usr/bin/env python3
"""
General Invoice Parser (Enhanced)

Purpose:
- Parse vendor-unknown invoices using multi-strategy extraction:
  1) Structured PDF text extraction via PyMuPDF (fitz)
  2) Fallback to pdfminer.six plain text
  3) As-needed OCR via pytesseract on rasterized pages for low-text PDFs

Output:
- Writes a normalized JSON to output_jsons/<base>.json with:
  vendor, invoice_number, invoice_date, due_date, invoice_total, office_location, line_items[]

Enhanced Features:
- Line item extraction using multiple pattern strategies
- Vendor name detection from PDF content
- Better date parsing and due date calculation
"""

import os
import sys
import re
import json
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_DIR = os.path.join(DATA_DIR, 'output_jsons')

# Office locations for PCS
OFFICE_LOCATIONS = [
    'Roseburg', 'Lebanon', 'Ridgefield', 'Milwaukie', 
    'Columbia', 'Salem', 'Eugene', 'Vancouver'
]

# Known vendor patterns for auto-detection
VENDOR_PATTERNS = {
    'Henry Schein': [r'henry\s*schein', r'henryschein'],
    'Patterson Dental': [r'patterson', r'patterson\s*dental'],
    'Epic Dental': [r'epic\s*dental', r'epic dental lab'],
    'TC Dental': [r't\.?c\.?\s*dental', r'tc dental lab'],
    'Artisan Dental': [r'artisan\s*dental'],
    'Exodus': [r'exodus'],
    'Darby Dental': [r'darby\s*dental', r'darbydental'],
    'Dandy': [r'dandy', r'meetdandy'],
    'Brasseler': [r'brasseler'],
    'Comcast': [r'comcast'],
}


def safe_mkdir(path: str) -> None:
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass


def read_pdf_text_fitz(pdf_path: str) -> str:
    try:
        import fitz
        doc = fitz.open(pdf_path)
        texts = []
        for page in doc:
            texts.append(page.get_text('text'))
        doc.close()
        return '\n'.join(texts)
    except Exception:
        return ''


def read_pdf_text_pdfminer(pdf_path: str) -> str:
    try:
        from pdfminer.high_level import extract_text
        return extract_text(pdf_path) or ''
    except Exception:
        return ''


def ocr_pdf_first_pages(pdf_path: str, max_pages: int = 2) -> str:
    try:
        import fitz
        import pytesseract
        from PIL import Image

        doc = fitz.open(pdf_path)
        texts = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            texts.append(pytesseract.image_to_string(img))
        doc.close()
        return '\n'.join(texts)
    except Exception:
        return ''


def normalize_amount(value: str) -> str:
    """Normalize monetary amounts"""
    if not value:
        return ''
    # Remove currency symbols and commas
    cleaned = re.sub(r'[$,\s]', '', value)
    # Ensure it looks like a valid amount
    match = re.search(r'(\d+\.?\d*)', cleaned)
    return match.group(1) if match else ''


def detect_vendor(text: str) -> str:
    """Try to detect vendor from PDF text content"""
    text_lower = text.lower()
    
    for vendor_name, patterns in VENDOR_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return vendor_name
    
    return 'Unknown'


def extract_invoice_number(text: str) -> str:
    """Extract invoice number using multiple patterns"""
    patterns = [
        r"invoice\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"inv\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"bill\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"invoice\s*number\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"reference\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"\bno\.?\s*:?\s*([A-Za-z0-9\-\/]+)\b",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result = match.group(1).strip()
            # Filter out common false positives
            if result.lower() not in ['date', 'to', 'from', 'the', 'and']:
                return result
    
    return ''


def extract_dates(text: str) -> tuple:
    """Extract invoice date and due date"""
    # Date patterns
    date_patterns = [
        r"(\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4})",  # MM/DD/YYYY or MM-DD-YYYY
        r"(\d{4}[\-/]\d{2}[\-/]\d{2})",  # YYYY-MM-DD
        r"(\w+\s+\d{1,2},?\s+\d{4})",  # Month DD, YYYY
    ]
    
    invoice_date = ''
    due_date = ''
    
    # Try to find invoice date
    for pattern in [
        r"invoice\s*date\s*:?\s*" + date_patterns[0],
        r"date\s*:?\s*" + date_patterns[0],
        r"dated?\s*:?\s*" + date_patterns[0],
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            invoice_date = match.group(1)
            break
    
    # Fallback: find first date in text
    if not invoice_date:
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                invoice_date = match.group(1)
                break
    
    # Try to find due date
    for pattern in [
        r"due\s*date\s*:?\s*" + date_patterns[0],
        r"payment\s*due\s*:?\s*" + date_patterns[0],
        r"due\s*:?\s*" + date_patterns[0],
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            due_date = match.group(1)
            break
    
    # Calculate due date from invoice date if not found
    if not due_date and invoice_date:
        due_date = calculate_due_date(invoice_date)
    
    return invoice_date, due_date


def calculate_due_date(invoice_date: str, days: int = 30) -> str:
    """Calculate due date from invoice date"""
    if not invoice_date:
        return ''
    
    date_formats = [
        '%m/%d/%Y', '%m/%d/%y', '%m-%d-%Y', '%m-%d-%y',
        '%Y-%m-%d', '%Y/%m/%d',
        '%B %d, %Y', '%B %d %Y',
    ]
    
    for fmt in date_formats:
        try:
            dt = datetime.strptime(invoice_date.replace(',', ''), fmt.replace(',', ''))
            due = dt + timedelta(days=days)
            return due.strftime('%m/%d/%Y')
        except ValueError:
            continue
    
    return ''


def extract_total(text: str) -> str:
    """Extract invoice total"""
    patterns = [
        r"total\s*(?:amount)?\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"amount\s*due\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"balance\s*due\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"grand\s*total\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"invoice\s*total\s*:?\s*\$?\s*([\d,]+\.?\d*)",
    ]
    
    totals = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            try:
                val = float(m.replace(',', ''))
                if val > 0:
                    totals.append(val)
            except ValueError:
                continue
    
    # Return the largest value (likely the grand total)
    if totals:
        return str(max(totals))
    
    return ''


def extract_office_location(text: str) -> str:
    """Extract office location"""
    text_lower = text.lower()
    
    for location in OFFICE_LOCATIONS:
        if location.lower() in text_lower:
            return location
    
    return ''


def extract_line_items(text: str) -> List[Dict]:
    """
    Extract line items using multiple strategies.
    Returns list of dicts with: product_number, product_name, Quantity, unit_price, line_item_total
    """
    items = []
    lines = text.split('\n')
    
    # Strategy 1: Look for lines with quantity, description, and amounts
    # Pattern: Qty Description Price Total
    qty_desc_pattern = re.compile(
        r'^(\d+)\s+'  # Quantity
        r'(.{10,50}?)\s+'  # Description (10-50 chars)
        r'\$?([\d,]+\.?\d{0,2})\s*'  # Price
        r'\$?([\d,]+\.?\d{0,2})$'  # Total
    )
    
    # Strategy 2: Lines with product codes and amounts
    product_pattern = re.compile(
        r'([A-Z0-9]{5,15})\s+'  # Product code
        r'(.{5,40}?)\s+'  # Description
        r'(\d+)\s+'  # Quantity
        r'\$?([\d,]+\.?\d{0,2})'  # Amount
    )
    
    # Strategy 3: Simpler pattern - description followed by amount
    simple_pattern = re.compile(
        r'^(.{10,60}?)\s+'  # Description
        r'\$?([\d,]+\.\d{2})$'  # Amount with cents
    )
    
    seen_items = set()
    
    for line in lines:
        line = line.strip()
        if not line or len(line) < 15:
            continue
        
        # Skip header/footer lines
        skip_words = ['total', 'subtotal', 'tax', 'shipping', 'payment', 'balance', 
                      'invoice', 'date', 'due', 'bill to', 'ship to', 'page']
        if any(skip in line.lower() for skip in skip_words):
            continue
        
        # Try each pattern
        match = qty_desc_pattern.match(line)
        if match:
            qty, desc, price, total = match.groups()
            key = (desc.strip(), total)
            if key not in seen_items:
                seen_items.add(key)
                items.append({
                    'product_number': '',
                    'product_name': desc.strip(),
                    'Quantity': qty,
                    'unit_price': price.replace(',', ''),
                    'line_item_total': total.replace(',', ''),
                })
            continue
        
        match = product_pattern.search(line)
        if match:
            prod_code, desc, qty, amount = match.groups()
            key = (prod_code, amount)
            if key not in seen_items:
                seen_items.add(key)
                items.append({
                    'product_number': prod_code,
                    'product_name': desc.strip(),
                    'Quantity': qty,
                    'unit_price': amount.replace(',', ''),
                    'line_item_total': amount.replace(',', ''),
                })
            continue
        
        match = simple_pattern.match(line)
        if match:
            desc, amount = match.groups()
            # Only add if amount is reasonable (not too large, not zero)
            try:
                amt = float(amount.replace(',', ''))
                if 0 < amt < 100000:
                    key = (desc.strip()[:30], amount)
                    if key not in seen_items:
                        seen_items.add(key)
                        items.append({
                            'product_number': '',
                            'product_name': desc.strip(),
                            'Quantity': '1',
                            'unit_price': amount.replace(',', ''),
                            'line_item_total': amount.replace(',', ''),
                        })
            except ValueError:
                continue
    
    return items


def parse(pdf_path: str) -> Optional[Dict]:
    """Main parsing function"""
    safe_mkdir(OUTPUT_DIR)

    # Multi-strategy text extraction
    text = read_pdf_text_fitz(pdf_path)
    if not text or len(text) < 20:
        text = read_pdf_text_pdfminer(pdf_path)
    if not text or len(text) < 20:
        text = ocr_pdf_first_pages(pdf_path)

    if not text or len(text) < 10:
        print(f"⚠️ Could not extract text from {pdf_path}")
        return None

    # Extract all fields
    vendor = detect_vendor(text)
    invoice_number = extract_invoice_number(text)
    invoice_date, due_date = extract_dates(text)
    invoice_total = extract_total(text)
    office_location = extract_office_location(text)
    line_items = extract_line_items(text)

    result = {
        'vendor': vendor,
        'vendor_name': vendor,
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'due_date': due_date,
        'invoice_total': invoice_total,
        'office_location': office_location,
        'line_items': line_items,
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now(timezone.utc).isoformat(),
    }

    # Save output
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(OUTPUT_DIR, f"{base}.json")

    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"✅ General invoice parsed: {invoice_number or 'unknown'}")
    print(f"   Vendor: {vendor}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}")
    print(f"   Line items: {len(line_items)}")

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 general_invoice_parser.py <pdf_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    result = parse(pdf_path)
    if result:
        print(json.dumps(result, indent=2))
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
