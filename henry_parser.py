
# Final Henry Schein invoice parser (scanned + digital)
# Digital logic now supports multi-line block parsing around product number anchors

import os
import re
import json
import fitz
import pandas as pd
from pathlib import Path
from typing import Dict, List
from pdf2image import convert_from_path
import pytesseract
from pytesseract import Output
from collections import defaultdict

OFFICE_FILE = os.path.expanduser("~/Desktop/MemorAI_PCS/smiles_office_info.xls")
df = pd.read_excel(OFFICE_FILE, header=None)
cities = df.iloc[0]
addresses = df.iloc[1]
OFFICE_CITY_MAP = {str(address).strip().lower(): str(city).strip() for city, address in zip(cities, addresses)}

OUTPUT_DIR = "output_jsons/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def is_scanned(pdf_path: str) -> bool:
    return all(not page.get_text().strip() for page in fitz.open(pdf_path))

def clean_office(text: str) -> str:
    txt = text.strip().lower().replace("denitel", "dental")
    txt = re.sub(r"(pete|ease|corporate|office|\n)", " ", txt)
    for address, city in OFFICE_CITY_MAP.items():
        if address in txt:
            return city
    for city in OFFICE_CITY_MAP.values():
        if city.lower() in txt:
            return city
    return ""

def parse_digital_invoice(pdf_path: str) -> Dict:
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()

    invoice_number = re.search(r"Invoice[#\s]*\n?\s*(\d{8})", text)
    invoice_date = re.search(r"Invoice Date\s*\n?\s*(\d{2}/\d{2}/\d{2})", text)
    invoice_total = re.search(r"Invoice Total\s*\n?\s*\$?(\d+\.\d{2})", text)
    office_block = re.search(r"Ship/Sold-To:.*?\n(.*?)\n", text, re.DOTALL)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    items = []
    seen = set()
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"\d{3}-\d{4}", line):
            product_number = line.strip()
            block = lines[i:i+10]
            block_text = " ".join(block)
            tokens = block_text.split()
            prices = [t for t in tokens if re.match(r"\d+\.\d{2}", t)]
            qty = next((t for t in tokens if t.isdigit()), None)
            name = ""
            try:
                pn_idx = tokens.index(product_number)
                qty_idx = tokens.index(qty, pn_idx+1)
                name = " ".join(tokens[pn_idx+1:qty_idx])
            except:
                pass
            if product_number and len(prices) >= 2 and qty:
                unit_price, line_total = prices[-2], prices[-1]
                key = (product_number, line_total)
                if key not in seen:
                    seen.add(key)
                    items.append({
                        "product_number": product_number,
                        "product_name": name,
                        "Quantity": qty,
                        "unit_price": unit_price,
                        "line_item_total": line_total
                    })
            i += 9
        else:
            i += 1

    # Extract due date; if blank, fallback to invoice_date + 30 days
    due_date = ""
    try:
        from due_date_extractor import extract_due_date
        invoice_date_str = invoice_date.group(1) if invoice_date else ""
        due_date = extract_due_date(text, invoice_date_str) or ""
        if not due_date and invoice_date_str:
            from datetime import datetime, timedelta
            base = None
            try:
                # Henry uses MM/DD/YY
                base = datetime.strptime(invoice_date_str, "%m/%d/%y")
            except Exception:
                try:
                    base = datetime.strptime(invoice_date_str, "%m/%d/%Y")
                except Exception:
                    base = None
            if base:
                due_date = (base + timedelta(days=30)).strftime("%m/%d/%Y")
        if due_date:
            print(f"📅 Henry due date: {due_date}")
        else:
            print("⚠️ Henry due date not found and fallback failed")
    except ImportError:
        print("⚠️ due_date_extractor module not found, skipping due date extraction")
    except Exception as e:
        print(f"⚠️ Error extracting due date: {e}")

    return {
        "vendor": "Henry schein",
        "invoice_number": invoice_number.group(1) if invoice_number else "",
        "invoice_date": invoice_date.group(1) if invoice_date else "",
        "due_date": due_date,
        "invoice_total": invoice_total.group(1) if invoice_total else "",
        "office_location": clean_office(office_block.group(1)) if office_block else "",
        "vendor_name": "Henry Schein",
        "line_items": items
    }

def parse_scanned_invoice(pdf_path: str) -> Dict:
    page = convert_from_path(pdf_path, dpi=300)[0]
    data = pytesseract.image_to_data(page, output_type=Output.DICT)

    FIELD_COORDS = {
        "invoice_number": (1500, 890, 1700, 920),
        "invoice_date":   (1800, 890, 2000, 920),
        "invoice_total":  (2300, 890, 2500, 920),
        "office_location":(1770, 310, 2100, 350)
    }

    LINE_COLUMNS = {
        "product_number": (160, 300),
        "description":    (320, 1000),
        "qty":            (1500, 1570),
        "unit_price":     (2020, 2100),
        "line_total":     (2200, 2300)
    }

    fields = {k: "" for k in FIELD_COORDS}
    for i, word in enumerate(data["text"]):
        if not word.strip():
            continue
        x, y = int(data["left"][i]), int(data["top"][i])
        for key, (x0, y0, x1, y1) in FIELD_COORDS.items():
            if x0 <= x <= x1 and y0 <= y <= y1:
                fields[key] += word + " "

    def clean_field(key, raw):
        txt = raw.strip()
        if key == "invoice_number":
            return txt if re.fullmatch(r"\d{8}", txt) else ""
        if key == "invoice_date":
            return txt if re.fullmatch(r"\d{2}/\d{2}/\d{2}", txt) else ""
        if key == "invoice_total":
            return txt.lstrip("$") if re.fullmatch(r"\$?\d+\.\d{2}", txt) else ""
        if key == "office_location":
            return clean_office(txt)
        return txt

    result = {k: clean_field(k, v) for k, v in fields.items()}
    result["vendor"] = "Henry schein"
    result["vendor_name"] = "Henry Schein"

    rows = defaultdict(list)
    for i, word in enumerate(data["text"]):
        if not word.strip():
            continue
        x, y = int(data["left"][i]), int(data["top"][i])
        bucket_y = round(y / 10) * 10
        rows[bucket_y].append((x, word))

    items = []
    for y in sorted(rows):
        columns = {k: "" for k in LINE_COLUMNS}
        for x, word in rows[y]:
            for col, (x0, x1) in LINE_COLUMNS.items():
                if x0 <= x <= x1:
                    columns[col] += word + " "
        if re.match(r"\d{3}-\d{4}", columns["product_number"]) and re.match(r"\d+\.\d{2}", columns["line_total"]):
            items.append({
                "product_number": columns["product_number"].strip(),
                "product_name": columns["description"].strip(),
                "Quantity": columns["qty"].strip() or "1",
                "unit_price": columns["unit_price"].strip() or "0.00",
                "line_item_total": columns["line_total"].strip() or "0.00"
            })

    result["line_items"] = items
    
    # Extract due date for scanned invoices; fallback to invoice_date + 30
    try:
        from due_date_extractor import extract_due_date
        all_text = " ".join(data["text"])
        dd = extract_due_date(all_text, result.get("invoice_date", "")) or ""
        if not dd and result.get("invoice_date"):
            from datetime import datetime, timedelta
            base = None
            inv = result.get("invoice_date", "")
            try:
                base = datetime.strptime(inv, "%m/%d/%y")
            except Exception:
                try:
                    base = datetime.strptime(inv, "%m/%d/%Y")
                except Exception:
                    base = None
            if base:
                dd = (base + timedelta(days=30)).strftime("%m/%d/%Y")
        result["due_date"] = dd
        print(f"📅 Henry scanned due date: {dd or 'N/A'}")
    except ImportError:
        print("⚠️ due_date_extractor module not found, skipping due date extraction")
        result["due_date"] = ""
    except Exception as e:
        print(f"⚠️ Error extracting due date: {e}")
        result["due_date"] = ""
    
    return result

def parse(pdf_path: str) -> Dict:
    # Check for HISTORICAL keyword - if found, skip this PDF entirely
    try:
        if is_scanned(pdf_path):
            # For scanned PDFs, use OCR to check for HISTORICAL
            page = convert_from_path(pdf_path, dpi=300)[0]
            ocr_text = pytesseract.image_to_string(page).upper()
        else:
            # For digital PDFs, extract text directly
            doc = fitz.open(pdf_path)
            ocr_text = ""
            for page in doc:
                ocr_text += page.get_text()
            ocr_text = ocr_text.upper()
        
        if "HISTORICAL" in ocr_text:
            print("⏭️ Skipping HISTORICAL document - not a true invoice")
            return None
            
    except Exception as e:
        print(f"⚠️ Error checking for HISTORICAL keyword: {e}")
        # Continue with parsing if we can't check for HISTORICAL
    
    result = parse_scanned_invoice(pdf_path) if is_scanned(pdf_path) else parse_digital_invoice(pdf_path)
    
    # Only save if we got a valid result
    if result:
        outpath = os.path.join(OUTPUT_DIR, Path(pdf_path).stem + ".json")
        with open(outpath, "w") as f:
            json.dump(result, f, indent=2)
    
    return result

if __name__ == "__main__":
    import sys
    parsed = parse(sys.argv[1])
    print(json.dumps(parsed, indent=2))
