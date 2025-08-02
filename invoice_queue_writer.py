import os
import sys
import json
from datetime import datetime

def load_invoice_data(json_path):
    with open(json_path, "r") as f:
        return json.load(f)

def append_to_invoice_queue(entry, queue_path):
    if os.path.exists(queue_path):
        with open(queue_path, "r") as f:
            queue = json.load(f)
    else:
        queue = []

    queue.append(entry)

    with open(queue_path, "w") as f:
        json.dump(queue, f, indent=2)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 invoice_queue_writer.py <parsed_json_path> <original_pdf_path>")
        sys.exit(1)

    parsed_json_path = os.path.expanduser(sys.argv[1])
    original_pdf_path = os.path.expanduser(sys.argv[2])
    invoice_queue_path = os.path.expanduser("~/Desktop/MemorAI_PCS/invoice_queue.json")

    data = load_invoice_data(parsed_json_path)

    entry = {
        "invoice_number": data.get("invoice_number", "UNKNOWN"),
        "invoice_date": data.get("invoice_date", "UNKNOWN"),
        "vendor": data.get("vendor_name", "UNKNOWN"),
        "clinic_id": data.get("clinic_id", "UNKNOWN"),
        "total": data.get("total", 0.0),
        "status": "new",
        "json_path": parsed_json_path,
        "pdf_path": original_pdf_path,
        "timestamp": datetime.now().isoformat()
    }

    append_to_invoice_queue(entry, invoice_queue_path)
    print(f"✅ Added invoice {entry['invoice_number']} to queue.")