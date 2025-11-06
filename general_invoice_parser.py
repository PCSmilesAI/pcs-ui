#!/usr/bin/env python3
"""
General Invoice Parser

Purpose:
- Parse vendor-unknown invoices using multi-strategy extraction:
  1) Structured PDF text extraction via PyMuPDF (fitz)
  2) Fallback to pdfminer.six plain text
  3) As-needed OCR via pytesseract on rasterized pages for low-text PDFs

Output:
- Writes a normalized JSON to output_jsons/<base>.json with at least:
  vendor, invoice_number, invoice_date, invoice_total, office_location, line_items[]

Note:
- Keep dependencies optional; gracefully skip steps if modules missing.
"""

import os
import sys
import re
import json
from datetime import datetime

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_DIR = os.path.join(DATA_DIR, 'output_jsons')


def safe_mkdir(path: str) -> None:
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass


def read_pdf_text_fitz(pdf_path: str) -> str:
    try:
        import fitz  # PyMuPDF
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
    if not value:
        return ''
    m = re.search(r"([\$]?\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)", value)
    return (m.group(1).replace(' ', '') if m else '').lstrip('$')


def extract_fields(text: str) -> dict:
    lines = [l.strip() for l in (text or '').splitlines() if l.strip()]
    blob = '\n'.join(lines)

    # Invoice number
    inv_patterns = [
        r"invoice\s*#?\s*([A-Za-z0-9\-\/]+)",
        r"inv\s*#?\s*([A-Za-z0-9\-\/]+)",
        r"bill\s*#?\s*([A-Za-z0-9\-\/]+)",
        r"\bno\.?\s*([A-Za-z0-9\-\/]+)\b",
    ]
    invoice_number = ''
    for pat in inv_patterns:
        m = re.search(pat, blob, re.IGNORECASE)
        if m:
            invoice_number = m.group(1)
            break

    # Dates (prefer mm/dd/yy or yyyy-mm-dd)
    date_patterns = [
        r"\b(\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4})\b",
        r"\b(\d{4}[\-]\d{2}[\-]\d{2})\b",
    ]
    invoice_date = ''
    for pat in date_patterns:
        m = re.search(pat, blob)
        if m:
            invoice_date = m.group(1)
            break

    # Total: look for a line containing Total / Amount Due
    total_patterns = [
        r"total\s*:?\s*\$?\s*([\d,\.]+)",
        r"amount due\s*:?\s*\$?\s*([\d,\.]+)",
        r"balance due\s*:?\s*\$?\s*([\d,\.]+)",
    ]
    invoice_total = ''
    for pat in total_patterns:
        m = re.search(pat, blob, re.IGNORECASE)
        if m:
            invoice_total = normalize_amount(m.group(0)) or m.group(1)
            break

    # Office/location heuristic
    office_patterns = [
        r"(Roseburg|Lebanon|Ridgefield|Milwaukie|Columbia|Salem)",
    ]
    office_location = ''
    for pat in office_patterns:
        m = re.search(pat, blob, re.IGNORECASE)
        if m:
            office_location = m.group(1)
            break

    return {
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'invoice_total': invoice_total,
        'office_location': office_location,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 general_invoice_parser.py <pdf_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    safe_mkdir(OUTPUT_DIR)

    # Multi-strategy text extraction
    text = read_pdf_text_fitz(pdf_path)
    if not text or len(text) < 20:
        text = read_pdf_text_pdfminer(pdf_path)
    if (not text or len(text) < 20):
        text = ocr_pdf_first_pages(pdf_path)

    fields = extract_fields(text)

    base = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(OUTPUT_DIR, f"{base}.json")

    # Minimal normalized payload
    payload = {
        'vendor': 'Unknown',
        'invoice_number': fields.get('invoice_number') or '',
        'invoice_date': fields.get('invoice_date') or '',
        'invoice_total': fields.get('invoice_total') or '',
        'office_location': fields.get('office_location') or '',
        'line_items': [],
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.utcnow().isoformat(),
    }

    with open(out_path, 'w') as f:
        json.dump(payload, f, indent=2)

    print(f"Extracted general invoice JSON -> {out_path}")
    sys.exit(0)


if __name__ == '__main__':
    main()


