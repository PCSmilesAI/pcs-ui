#!/usr/bin/env python3
"""
Bridgeford / BFV Invoice Parser

Parses Bridgeford invoices (various services).
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
    text = ""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text()
        doc.close()
        if text.strip():
            return text
    except Exception:
        pass
    
    # OCR fallback
    try:
        import fitz
        import pytesseract
        from PIL import Image
        
        doc = fitz.open(pdf_path)
        texts = []
        for i, page in enumerate(doc):
            if i >= 2:
                break
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            texts.append(pytesseract.image_to_string(img))
        doc.close()
        return '\n'.join(texts)
    except Exception:
        pass
    
    return text


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
        r'Invoice\s*#?\s*(\d+)',
        r'INV[#:\s]*(\d+)',
        r'Bill\s*#?\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_invoice_date(text: str) -> str:
    """Extract invoice date"""
    patterns = [
        r'Invoice\s*Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_due_date(text: str) -> str:
    """Extract due date"""
    patterns = [
        r'Due\s*Date[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
        r'Payment\s*Due[:\s]*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def parse_invoice_total(text: str) -> str:
    """Extract total amount"""
    patterns = [
        r'Total\s*\$?([\d,]+\.\d{2})',
        r'Amount\s*Due\s*\$?([\d,]+\.\d{2})',
        r'Balance\s*\$?([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return matches[-1].replace(',', '')
    return ""


def parse_line_items(text: str) -> List[Dict]:
    """Extract line items"""
    items = []
    
    # Generic pattern for description + amount
    pattern = re.compile(
        r'^(.+?)\s+\$([\d,]+\.\d{2})$',
        re.MULTILINE
    )
    
    for match in pattern.finditer(text):
        desc = match.group(1).strip()
        # Skip header/summary lines
        if any(skip in desc.lower() for skip in ['total', 'subtotal', 'tax', 'balance']):
            continue
        if len(desc) > 5:  # Skip short matches that are likely noise
            items.append({
                'product_number': '',
                'product_name': desc,
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
    
    # This is a general purpose parser for Bridgeford/BFV
    if not any(x in text.lower() for x in ['bridgeford', 'bfv', 'pacific crest']):
        print(f"⚠️ Not a Bridgeford invoice: {pdf_path}")
        return None
    
    invoice_number = parse_invoice_number(text)
    invoice_date = parse_invoice_date(text)
    due_date = parse_due_date(text)
    invoice_total = parse_invoice_total(text)
    office_location = clean_office_location(text)
    line_items = parse_line_items(text)
    
    result = {
        'vendor': 'Bridgeford',
        'vendor_name': 'Bridgeford',
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
    
    print(f"✅ Bridgeford invoice parsed: {invoice_number}")
    print(f"   Date: {invoice_date}, Total: ${invoice_total}")
    print(f"   Office: {office_location}")
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 bridgeford_parser.py <pdf_path>")
        sys.exit(1)
    
    result = parse(sys.argv[1])
    if result:
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)





