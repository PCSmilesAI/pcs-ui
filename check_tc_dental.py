#!/usr/bin/env python3
import json

with open('pcs_ai_data/invoice_queue.json', 'r') as f:
    queue = json.load(f)

tc_invoices = [inv for inv in queue if inv.get('vendor_name') == 'TC Dental']
print(f'Found {len(tc_invoices)} TC Dental invoices')

for i, inv in enumerate(tc_invoices):
    print(f'{i+1}. {inv.get("invoice_number")} - {inv.get("patient_name", "Unknown")} - ${inv.get("total")}')
