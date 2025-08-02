import sys
import os
import fitz
import pytesseract
from pdf2image import convert_from_path
import subprocess
import time
import re

# Config
KNOWN_VENDORS = {
    "exodus": {
        "keywords": ["exodus dental solutions"],
        "parser": "exodus_agent.py"
    },
    "patterson": {
        "keywords": ["patterson dental"],
        "parser": "patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py"
    },
    "tc_dental": {
        "keywords": ["tc dental lab"],
        "parser": "parse_tc_dental_invoice.py"
    },
    "henry": {
        "keywords": ["henry schein"],
        "parser": "henry_parser.py"
    },
    "artisan": {
        "keywords": ["artisan dental"],
        "parser": "parse_artisan_dental_exporting_fixed.py"
    }
}

PARSER_FOLDER = os.path.expanduser("~/Desktop/MemorAI_PCS/")
OUTPUT_FOLDER = os.path.expanduser("~/Desktop/MemorAI_PCS/output_jsons/")
QUEUE_WRITER = os.path.expanduser("~/Desktop/MemorAI_PCS/invoice_queue_writer.py")

def extract_text(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        text = "\n".join([page.get_text() for page in doc])
        if len(text.strip()) > 20:
            return text.lower()
    except:
        pass

    try:
        images = convert_from_path(pdf_path)
        ocr_text = "\n".join([pytesseract.image_to_string(img) for img in images])
        return ocr_text.lower()
    except:
        return ""

def detect_vendor(text):
    for slug, data in KNOWN_VENDORS.items():
        for kw in data["keywords"]:
            if kw in text:
                return slug, data["parser"]
    return None, None

def run_parser(script, pdf_path):
    parser_path = os.path.join(PARSER_FOLDER, script)
    result = subprocess.run(["python3", parser_path, pdf_path], capture_output=True, text=True)
    return result

def find_latest_json(invoice_number_prefix):
    files = sorted(
        [f for f in os.listdir(OUTPUT_FOLDER) if f.endswith(".json") and invoice_number_prefix in f],
        key=lambda f: os.path.getmtime(os.path.join(OUTPUT_FOLDER, f)),
        reverse=True
    )
    if files:
        return os.path.join(OUTPUT_FOLDER, files[0])
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 vendor_router.py <invoice.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    text = extract_text(pdf_path)
    vendor_slug, parser_script = detect_vendor(text)

    if vendor_slug and parser_script:
        result = run_parser(parser_script, pdf_path)

        # Attempt to extract invoice number from parser output
        output_text = result.stdout + result.stderr
        match = re.search(r'"?invoice_number"?\s*[:=]\s*"?([A-Za-z0-9\-_]+)"?', output_text)
        invoice_id = match.group(1) if match else None

        if invoice_id:
            time.sleep(1)  # wait briefly for file system write
            json_path = find_latest_json(invoice_id)
            if json_path and os.path.exists(QUEUE_WRITER):
                subprocess.run(["python3", QUEUE_WRITER, json_path, pdf_path])
        print(KNOWN_VENDORS[vendor_slug]["keywords"][0].title())
    else:
        print("Unknown")
        sys.exit(2)