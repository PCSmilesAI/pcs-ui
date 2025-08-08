import fitz
import re
import collections
import json
from typing import List, Dict, Any

def parse_invoice(pdf_path: str) -> Dict[str, Any]:
    """
    Parse an Artisan Dental invoice PDF and return a dictionary containing
    vendor details, invoice metadata, and line item information.
    This function assumes the invoice layout is consistent across invoices.
    """
    # Open the PDF using PyMuPDF
    doc = fitz.open(pdf_path)

    # Collect all text spans along with their x/y coordinates
    spans: List[Dict[str, Any]] = []
    for page in doc:
        page_dict = page.get_text("dict")
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if text:
                        spans.append({
                            "text": text,
                            "x": span["bbox"][0],
                            "y": span["bbox"][1]
                        })

    # Group spans by their y-coordinate using a small tolerance to form rows
    rows: Dict[int, List[Dict[str, Any]]] = collections.defaultdict(list)
    for sp in spans:
        # Round y to the nearest multiple of 3 to group text on the same horizontal line
        key = round(sp['y'] / 3) * 3
        rows[key].append(sp)

    line_items: List[Dict[str, str]] = []

    # Iterate over each row to extract line item information
    for key in sorted(rows.keys()):
        row = rows[key]
        # Sort items in the row left-to-right
        row_sorted = sorted(row, key=lambda x: x['x'])
        texts = [sp['text'] for sp in row_sorted]
        row_upper = ' '.join(texts).upper()

        # Skip rows that are headers or footers
        skip_keywords = [
            'PATIENT NAME', 'ACCOUNT NO', 'SHADE', 'INVOICE DATE',
            'INVOICE NO', 'QUANTITY', 'MOULD', 'AMOUNT', 'SERVICE',
            'DWT', 'TOTAL', 'LATE CHARGE'
        ]
        if any(keyword in row_upper for keyword in skip_keywords):
            continue

        # Consider only rows with at least one decimal number (potential quantity/price)
        if len(texts) >= 3 and any(re.match(r'^\d+\.\d+$', t) for t in texts):
            # Identify the quantity: the first token with a decimal value
            quantity = None
            quantity_index = None
            for i, token in enumerate(texts):
                if re.match(r'^\d+\.\d+$', token):
                    quantity = token
                    quantity_index = i
                    break
            if quantity is None:
                continue

            # Find all price tokens (decimal numbers) after the quantity
            price_candidates = [
                (i, token) for i, token in enumerate(texts)
                if i > quantity_index and re.match(r'^\d+\.\d{2}$', token)
            ]
            if not price_candidates:
                continue

            # The last price candidate is treated as the line item total
            last_price_index, line_item_total = price_candidates[-1]
            # If there is more than one price candidate, the one before the last is a unit price
            unit_price = 'N/A'
            if len(price_candidates) > 1:
                _, unit_price = price_candidates[-2]

            # Extract product number and product name between quantity and the last price
            product_number = None
            product_name_tokens: List[str] = []
            for i in range(quantity_index + 1, last_price_index):
                token = texts[i]
                if product_number is None and re.match(r'^\d+$', token):
                    product_number = token
                else:
                    product_name_tokens.append(token)
            product_name = ' '.join(product_name_tokens).strip()

            # Append the line item if a product number was found
            if product_number:
                line_items.append({
                    'product_number': product_number,
                    'product_name': product_name,
                    'Quantity': quantity,
                    'unit_price': unit_price,
                    'line_item_total': line_item_total
                })

    # Concatenate all text for global searches
    all_text = '\n'.join(sp['text'] for sp in spans)

    # Extract the invoice date (format: MM/DD/YYYY)
    invoice_date_match = re.search(r'\b\d{2}/\d{2}/\d{4}\b', all_text)
    invoice_date = invoice_date_match.group(0) if invoice_date_match else ''

    # Extract invoice number (format: IN followed by digits)
    invoice_number_match = re.search(r'\bIN\d+\b', all_text)
    invoice_number = invoice_number_match.group(0) if invoice_number_match else ''

    # Extract the invoice total as the last decimal number in the document
    decimal_numbers = re.findall(r'\d+\.\d{2}', all_text)
    total = decimal_numbers[-1] if decimal_numbers else ''

    # Determine office location: first city (without comma) followed by state and ZIP code
    office_location = None
    for line in all_text.split('\n'):
        match = re.match(r'([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+([A-Z]{2})\s+\d{5}', line)
        # Choose lines that do not include commas to avoid vendor addresses like "Portland, OR"
        if match and ',' not in line:
            city = match.group(1)
            # In the sample output only the first word (e.g., "Salem") is desired
            office_location = city.split()[0]
            break

    # Extract due date
    due_date = ""
    try:
        from due_date_extractor import extract_due_date
        due_date = extract_due_date(all_text, invoice_date)
        if due_date:
            print(f"📅 Found due date: {due_date}")
        else:
            print("⚠️ No due date found")
    except ImportError:
        print("⚠️ due_date_extractor module not found, skipping due date extraction")
    except Exception as e:
        print(f"⚠️ Error extracting due date: {e}")

    return {
        'vendor': 'artisan dental laboratory',
        'vendor_name': 'Artisan Dental',
        'invoice_number': invoice_number,
        'invoice_date': invoice_date,
        'due_date': due_date,
        'total': total,
        'office_location': office_location,
        'line_items': line_items
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Parse Artisan Dental invoice PDF to JSON.')
    parser.add_argument('pdf_path', help='Path to the invoice PDF file')
    args = parser.parse_args()
    result = parse_invoice(args.pdf_path)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

if __name__ == "__main__":
    import sys
    import json
    import os

    if len(sys.argv) != 2:
        print("Usage: python parse_artisan_dental_exporting.py <path_to_invoice.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output = parse_invoice(pdf_path)

    # Ensure output folder exists
    output_dir = os.path.expanduser("~/Desktop/MemorAI_PCS/output_jsons")
    os.makedirs(output_dir, exist_ok=True)

    # Build output file path
    pdf_name = os.path.basename(pdf_path).replace(".pdf", "_parsed.json")
    json_path = os.path.join(output_dir, pdf_name)

    with open(json_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"✅ Parsed data saved to: {json_path}")
