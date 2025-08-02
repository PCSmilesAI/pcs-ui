
import subprocess
import re
import json
import os
import argparse


def parse_tc_dental_invoice(pdf_path: str) -> dict:
    pdf_path = os.path.expanduser(pdf_path)  # Expand ~
    try:
        completed = subprocess.run(
            ['pdftotext', '-layout', '-nopgbrk', pdf_path, '-'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        text = completed.stdout.decode('utf-8', errors='ignore')
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to convert PDF: {e.stderr.decode()}")

    lines = text.split('\n')
    normalized_text = re.sub(r' {2,}', ' ', text.replace('\t', ' '))

    invoice_number_match = re.search(r'Invoice Number:.*?([A-Za-z0-9]+-[A-Za-z0-9]+)', text, re.DOTALL)
    invoice_date_match = re.search(r'Invoice Date:.*?([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})', text, re.DOTALL)
    total_match = re.search(r'SUB TOTAL.*?\$\s*([0-9,.]+)', text, re.IGNORECASE)

    invoice_number = invoice_number_match.group(1) if invoice_number_match else ''
    invoice_date = invoice_date_match.group(1) if invoice_date_match else ''
    total = total_match.group(1) if total_match else ''

    office_location = 'Salem'
    vendor_name = 'TC Dental'
    vendor = 'tc dental laboratory, inc.'

    line_items = []
    start_idx = None
    for idx, line in enumerate(lines):
        if 'ITEM DESCRIPTION' in line and 'UNIT PRICE' in line:
            start_idx = idx
            break

    if start_idx is not None:
        for row in lines[start_idx + 1:]:
            if re.search(r'(SUB TOTAL|Note|CUSTOMER SATISFACTION)', row, re.IGNORECASE):
                break
            if not row.strip():
                continue
            line_match = re.match(r'(.*?)\$\s*([0-9,.]+)\s+([0-9,.]+)\s+\$\s*([0-9,.]+)', row)
            if line_match:
                description = line_match.group(1).strip()
                unit_price = line_match.group(2)
                quantity = line_match.group(3)
                line_total = line_match.group(4)
                line_items.append({
                    "product_number": "N/A",
                    "product_name": description,
                    "Quantity": quantity,
                    "unit_price": unit_price,
                    "line_item_total": line_total
                })

    return {
        "vendor": vendor,
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "total": total,
        "office_location": office_location,
        "vendor_name": vendor_name,
        "line_items": line_items
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path", help="Path to TC Dental PDF invoice")
    args = parser.parse_args()

    data = parse_tc_dental_invoice(args.pdf_path)
    print(json.dumps(data, indent=2))

    output_dir = os.path.expanduser("~/Desktop/MemorAI_PCS/output_jsons")
    os.makedirs(output_dir, exist_ok=True)
    base_filename = os.path.splitext(os.path.basename(args.pdf_path))[0] + ".json"
    output_path = os.path.join(output_dir, base_filename)

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"✅ JSON saved to: {output_path}")


if __name__ == "__main__":
    main()
