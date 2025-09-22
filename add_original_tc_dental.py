#!/usr/bin/env python3
import json

# Load current queue
with open('pcs_ai_data/invoice_queue.json', 'r') as f:
    current_queue = json.load(f)

# Manually recreate the original TC Dental invoices
original_tc_invoices = [
    {
        "vendor": "tc dental laboratory, inc.",
        "invoice_number": "251-608",
        "invoice_date": "5/13/2025",
        "total": "267.00",
        "office_location": "Salem",
        "vendor_name": "TC Dental",
        "line_items": [
            {
                "product_number": "N/A",
                "product_name": "D2740 Full Zirconia Crown Posterior",
                "Quantity": "3.00",
                "unit_price": "89.00",
                "line_item_total": "267.00"
            }
        ],
        "id": "inv_7",
        "status": "pending",
        "assigned_to": None,
        "created_at": "2025-09-12T14:53:08.218740",
        "source_file": "tc_invoice_1.json",
        "pdf_path": None
    },
    {
        "vendor": "tc dental laboratory, inc.",
        "invoice_number": "251-879",
        "invoice_date": "5/20/2025",
        "total": "178.00",
        "office_location": "Salem",
        "vendor_name": "TC Dental",
        "line_items": [
            {
                "product_number": "N/A",
                "product_name": "D2740 Full Zirconia Crown Posterior",
                "Quantity": "2.00",
                "unit_price": "89.00",
                "line_item_total": "178.00"
            }
        ],
        "id": "inv_203",
        "status": "pending",
        "assigned_to": None,
        "created_at": "2025-09-12T14:53:08.260598",
        "source_file": "tc_invoice_3.json",
        "pdf_path": None
    },
    {
        "vendor": "tc dental laboratory, inc.",
        "invoice_number": "252-487",
        "invoice_date": "5/20/2025",
        "total": "445.00",
        "office_location": "Salem",
        "vendor_name": "TC Dental",
        "line_items": [
            {
                "product_number": "N/A",
                "product_name": "D2740 Full Zirconia Crown Posterior",
                "Quantity": "5.00",
                "unit_price": "89.00",
                "line_item_total": "445.00"
            }
        ],
        "id": "inv_238",
        "status": "pending",
        "assigned_to": None,
        "created_at": "2025-09-12T14:53:08.266325",
        "source_file": "tc_invoice_2.json",
        "pdf_path": None
    }
]

print(f'Current queue size: {len(current_queue)}')
print(f'Adding {len(original_tc_invoices)} original TC Dental invoices')

# Add original TC Dental invoices back
for inv in original_tc_invoices:
    current_queue.append(inv)
    print(f'Restored: {inv.get("invoice_number")} - ${inv.get("total")}')

# Save updated queue
with open('pcs_ai_data/invoice_queue.json', 'w') as f:
    json.dump(current_queue, f, indent=2)

print(f'Final queue size: {len(current_queue)}')
print('✅ Original TC Dental invoices restored!')
