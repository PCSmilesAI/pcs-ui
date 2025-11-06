#!/usr/bin/env python3
import json
import os

# Create test invoice
test_invoice = {
    "id": "test-invoice-001",
    "vendor": "Braxton Ellsworth",
    "vendor_name": "Braxton Ellsworth",
    "invoice_number": "INV-2025-001",
    "invoice_date": "11/03/2025",
    "due_date": "12/03/2025",
    "invoice_total": "5.00",
    "office_location": "Eugene",
    "status": "awaiting_office_approval",
    "approved": False,
    "approvals": {},
    "line_items": [
        {
            "product_number": "TEST-001",
            "product_name": "Test Service",
            "Quantity": "1",
            "unit_price": "5.00",
            "line_item_total": "5.00"
        }
    ]
}

# Create directory
os.makedirs('pcs_ui_data', exist_ok=True)

# Write file
with open('pcs_ui_data/invoice_queue.json', 'w') as f:
    json.dump([test_invoice], f, indent=2)

print('Created test invoice in pcs_ui_data/invoice_queue.json')

