import json
import re
import fitz  # PyMuPDF
from typing import List, Dict

def parse_exodus_invoice(pdf_path: str) -> Dict:
    """
    Parse an Exodus Dental Solutions invoice PDF and extract key fields.

    Parameters
    ----------
    pdf_path : str
        Path to the PDF file to parse.

    Returns
    -------
    Dict
        Parsed invoice data following the specified schema.
    """
    # Read entire text from all pages
    pdf = fitz.open(pdf_path)
    text = ''
    for page in pdf:
        # get plain text for each page
        text += page.get_text("text") + "\n"

    # Split into clean lines
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # Prepare dictionary with constant vendor slug and vendor name
    result = {
        "vendor": "exodus_dental_solutions",
        "vendor_name": "Exodus Dental Solutions",
        "invoice_number": None,
        "invoice_date": None,
        "total": None,
        "office_location": None,
        "line_items": []
    }

    # Extract invoice number (look for "No." followed by digits)
    for ln in lines:
        m = re.search(r'No\.\s*(\d+)', ln, re.IGNORECASE)
        if m:
            result["invoice_number"] = m.group(1)
            break

    # Extract invoice date (first occurrence of MM/DD/YYYY or M/D/YYYY)
    date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', text)
    if date_match:
        result["invoice_date"] = date_match.group(1)

    # Extract total amount (Total: $xx) ignoring any negative totals)
    # We search for pattern 'Total:' followed by currency and digits.
    total_match = re.search(r'Total:\s*\$([0-9,.]+)', text, re.IGNORECASE)
    if total_match:
        result["total"] = total_match.group(1)

    # Extract office location from the shipping address. Invoices include both
    # the vendor's address and the customer's shipping address. We only want
    # the city from the "Ship To" section. To avoid accidentally capturing
    # the vendor's city (e.g., Vancouver), locate the "Ship To:" marker and
    # then search for the first occurrence of a pattern like "City, ST ZIP"
    # after that point. The city is extracted from this match.
    ship_idx = None
    try:
        ship_idx = lines.index('Ship To:')
    except ValueError:
        ship_idx = None

    city = None
    # Define a regex to capture city names followed by a state code and ZIP
    city_pattern = re.compile(r'([A-Za-z\s]+),\s*[A-Z]{2}\s*\d{5}\b')

    if ship_idx is not None:
        # search only in lines after the shipping header
        for ln in lines[ship_idx + 1:]:
            m = city_pattern.search(ln)
            if m:
                city = m.group(1).strip()
                break
    # As a fallback, search the entire text (in case the above fails)
    if not city:
        m = city_pattern.search(text)
        if m:
            city = m.group(1).strip()

    if city:
        result["office_location"] = city

    # Identify index where description starts to parse line items.
    # The header 'Description' marks the beginning of item section.
    try:
        desc_index = lines.index('Description')
    except ValueError:
        desc_index = -1

    # Similarly, find 'Amount' header, usually right after 'Description'.
    # We'll start parsing two lines after 'Amount'.
    start_idx = None
    if desc_index != -1:
        # Look for 'Amount' header following description
        for i in range(desc_index, len(lines)):
            if lines[i].lower() == 'amount':
                start_idx = i + 1
                break

    if start_idx is None:
        # Fallback: look for first monetary line after 'Description'
        start_idx = desc_index + 1 if desc_index != -1 else 0

    # Parse line items: iterate pairs of lines (description, amount)
    i = start_idx
    while i < len(lines):
        line = lines[i]
        # Stop when we reach 'Total:' line
        if line.lower().startswith('total'):
            break
        # Ensure there is a following line for amount
        if i + 1 >= len(lines):
            break
        next_line = lines[i + 1]
        # Determine if next_line is an amount (starts with $ or parenthesis)
        amount_str = None
        # Remove spaces
        nl = next_line.strip()
        # Check if it looks like a currency string: begins with $ or ( and contains digits and .
        if re.match(r'\(?\$\(?[0-9]', nl):
            amount_str = nl
        if amount_str:
            # If the amount is in parentheses, treat as discount and skip
            if '(' in amount_str and ')' in amount_str:
                # skip this pair entirely
                i += 2
                continue
            # Extract numeric value (remove $ and commas)
            value = amount_str.replace('$', '').replace(',', '').replace(' ', '')
            # Remove any parentheses just in case
            value = value.replace('(', '').replace(')', '')
            # Format with two decimal places if decimal present
            # Keep original format if includes decimal dot
            # We don't convert to float to avoid locale issues
            result["line_items"].append({
                "product_number": "N/A",
                "product_name": line,
                "Quantity": "N/A",
                "unit_price": value,
                "line_item_total": value
            })
            i += 2
            continue
        else:
            # Not an amount line; skip or move ahead
            i += 1

    # Due date rule for Exodus: always 30 days from invoice date (no parsing field)
    from datetime import datetime, timedelta
    result["due_date"] = ""
    try:
        if result.get("invoice_date"):
            base = datetime.strptime(result["invoice_date"], "%m/%d/%Y")
            result["due_date"] = (base + timedelta(days=30)).strftime("%m/%d/%Y")
            print(f"📅 Computed due date (invoice_date + 30): {result['due_date']}")
    except Exception as e:
        print(f"⚠️ Failed to compute Exodus due date: {e}")

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Parse Exodus Dental Solutions invoice PDF')
    parser.add_argument('pdf', help='Path to PDF file')
    parser.add_argument('-o', '--output', help='Output JSON file path', default=None)
    args = parser.parse_args()
    data = parse_exodus_invoice(args.pdf)
    json_output = json.dumps(data, indent=2)
    if args.output:
        with open(args.output, 'w') as f:
            f.write(json_output)
    else:
        print(json_output)


if __name__ == '__main__':
    main()

if __name__ == "__main__":
    import sys
    import os
    pdf_path = sys.argv[1]
    parsed_data = parse_exodus_invoice(pdf_path)
    print(json.dumps(parsed_data, indent=2))
    output_dir = "output_jsons"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{parsed_data['invoice_number']}.json")
    with open(output_path, "w") as f:
        json.dump(parsed_data, f, indent=2)
    print(f"✅ Saved to: {output_path}")

