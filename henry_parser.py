
# Final Henry Schein invoice parser (scanned + digital)
# Digital logic now supports multi-line block parsing around product number anchors

import os
import re
import json
import fitz
from pathlib import Path
from typing import Dict, List
from pdf2image import convert_from_path
import pytesseract
from pytesseract import Output
from collections import defaultdict

# Load office info from JSON
def load_office_map():
    """Load office mapping from office_info.json"""
    office_map = {}

    # Try multiple possible locations
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
            except Exception as e:
                print(f"⚠️ Error loading office info from {path}: {e}")
                continue

    # Fallback: return empty map
    print("⚠️ Could not load office_info.json, using fallback")
    return {}

OFFICE_CITY_MAP = load_office_map()

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

    # Try multiple patterns for invoice number
    invoice_number = None
    for pattern in [
        r"Invoice[#\s]*\n?\s*(\d{8})",  # Original pattern
        r"Invoice[#\s]*:?\s*(\d{7,10})",  # More flexible
        r"Invoice\s*#?\s*(\d{7,10})",  # Alternative format
        r"INV[#\s]*:?\s*(\d{7,10})",  # INV abbreviation
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            invoice_number = match
            break

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
        invoice_date_str = invoice_date.group(1) if invoice_date else ""
        
        # Try to extract due date from the text
        due_date_match = re.search(r"Due Date\s*\n?\s*(\d{2}/\d{2}/\d{2})", text)
        if due_date_match:
            due_date = due_date_match.group(1)
            print(f"📅 Extracted due date: {due_date}")
        
        # If no due date found, fallback to invoice_date + 30 days
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

    # Get full OCR text for pattern matching
    full_text = pytesseract.image_to_string(page)

    # Try to extract fields using pattern matching first (more reliable)
    result = {
        "invoice_number": "",
        "invoice_date": "",
        "invoice_total": "",
        "office_location": ""
    }

    # Extract invoice number using patterns
    for pattern in [
        r"Invoice[#\s]*:?\s*(\d{8})",
        r"Invoice[#\s]*:?\s*(\d{7,10})",
        r"INV[#\s]*:?\s*(\d{7,10})",
    ]:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            result["invoice_number"] = match.group(1)
            break

    # Extract invoice date
    date_match = re.search(r"Invoice Date[:\s]*(\d{1,2}/\d{1,2}/\d{2,4})", full_text, re.IGNORECASE)
    if date_match:
        result["invoice_date"] = date_match.group(1)

    # Extract invoice total
    total_match = re.search(r"Invoice Total[:\s]*\$?(\d+\.\d{2})", full_text, re.IGNORECASE)
    if total_match:
        result["invoice_total"] = total_match.group(1)

    # Extract office location - look for "Ship/Sold-To" or similar
    office_match = re.search(r"Ship[/\s]*(?:Sold)?-?To[:\s]*([^\n]+)", full_text, re.IGNORECASE)
    if office_match:
        result["office_location"] = clean_office(office_match.group(1))

    result["vendor"] = "Henry schein"
    result["vendor_name"] = "Henry Schein"

    # Extract line items using pattern matching
    items = []
    lines = full_text.split('\n')

    for line in lines:
        # Look for lines with product numbers (format: XXX-XXXX)
        if re.search(r"\d{3}-\d{4}", line):
            # Try to extract product number, qty, unit price, and line total
            product_match = re.search(r"(\d{3}-\d{4})", line)
            if product_match:
                product_number = product_match.group(1)

                # Extract prices from the line
                prices = re.findall(r"\d+\.\d{2}", line)
                qty_match = re.search(r"(?:Qty|QTY|Quantity)[:\s]*(\d+)", line, re.IGNORECASE)
                qty = qty_match.group(1) if qty_match else "1"

                # If we found at least 2 prices, use them as unit_price and line_total
                if len(prices) >= 2:
                    unit_price = prices[-2]
                    line_total = prices[-1]

                    items.append({
                        "product_number": product_number,
                        "product_name": "",
                        "Quantity": qty,
                        "unit_price": unit_price,
                        "line_item_total": line_total
                    })
                elif len(prices) == 1:
                    # If only one price, assume it's the line total
                    items.append({
                        "product_number": product_number,
                        "product_name": "",
                        "Quantity": qty,
                        "unit_price": "0.00",
                        "line_item_total": prices[0]
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
