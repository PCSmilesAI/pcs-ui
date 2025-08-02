import pytesseract
from pytesseract import Output
import fitz
from PIL import Image
import pandas as pd
import io
import re
import os
import json
from datetime import datetime
import unicodedata

def parse_invoice_from_scanned_pdf(pdf_path):
    invoice_number = "UNKNOWN"
    invoice_date = "UNKNOWN"
    line_items = []
    total = 0.0

    doc = fitz.open(pdf_path)
    page = doc.load_page(0)
    pix = page.get_pixmap(dpi=400)
    img = Image.open(io.BytesIO(pix.tobytes("png")))

    raw_text = pytesseract.image_to_string(img, config="--psm 6")
    raw_text = unicodedata.normalize("NFKD", raw_text)
    raw_text = raw_text.replace("·", ".").replace("–", "-").replace("—", "-")
    raw_text = re.sub(r"\s{2,}", " ", raw_text)

    print("\n===== RAW OCR TEXT FROM PAGE =====\n")
    print(raw_text)
    print("\n==================================\n")

    match = re.search(r"No\.?\s*(\d{3,10})", raw_text, re.IGNORECASE)
    if match:
        invoice_number = match.group(1)

    match = re.search(r"(\d{1,2}/\d{1,2}/\d{4})", raw_text)
    if match:
        invoice_date = match.group(1)

    match = re.search(r"Total[:\s\-]*\$?([\d,]+\.\d{2})", raw_text, re.IGNORECASE)
    if match:
        try:
            total = float(match.group(1).replace(",", ""))
        except:
            pass

    lines = raw_text.splitlines()
    for line in lines:
        line = line.strip()
        if not line or "discount" in line.lower() or "total:" in line.lower():
            continue

        match = re.search(r"(\d+)\s*[xX]\s*\$([\d,.]+)", line)
        if match:
            qty = int(match.group(1))
            unit_price = float(match.group(2).replace(",", ""))
            total_price = round(qty * unit_price, 2)
        else:
            prices = re.findall(r"\$([\d,]+\.\d{2})", line)
            if not prices:
                continue
            total_price = float(prices[-1].replace(",", ""))
            qty = 1
            unit_price = total_price

        description = re.split(r"\$[\d,]+\.\d{2}", line)[0].strip()
        line_items.append({
            "product_no": "EXODUS",
            "desc": description,
            "qty": qty,
            "unit_price": unit_price,
            "total": total_price
        })

    return {
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "line_items": line_items,
        "total": total
    }

if __name__ == "__main__":
    import sys
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not pdf_path or not os.path.exists(pdf_path):
        print("Usage: python3 exodus_agent.py <invoice.pdf>")
        sys.exit(1)

    result = parse_invoice_from_scanned_pdf(pdf_path)
    print(result)

    OUTPUT_DIR = os.path.expanduser("~/Desktop/MemorAI_PCS/output_jsons")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    filename = (
        f"exodus_{result['invoice_number']}.json"
        if result["invoice_number"] != "UNKNOWN"
        else f"exodus_invoice_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )
    output_path = os.path.join(OUTPUT_DIR, filename)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"✅ JSON saved to {output_path}")