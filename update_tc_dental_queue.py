#!/usr/bin/env python3
import json
import os

# Load existing queue
with open('pcs_ai_data/invoice_queue.json', 'r') as f:
    queue = json.load(f)

print(f'Original queue size: {len(queue)}')

# Remove old TC Dental invoices (keep only non-TC Dental)
filtered_queue = [inv for inv in queue if inv.get('vendor_name') != 'TC Dental']
print(f'After removing TC Dental: {len(filtered_queue)}')

# Add new TC Dental invoices
tc_files = [f for f in os.listdir('output_jsons') if 'email_49_20250911_154308_tc' in f and f.endswith('.json')]
print(f'Found {len(tc_files)} new TC Dental invoice files')

for file in tc_files:
    with open(f'output_jsons/{file}', 'r') as f:
        invoice_data = json.load(f)
    
    # Add to queue
    filtered_queue.append(invoice_data)
    print(f'Added: {invoice_data.get("invoice_number")} - {invoice_data.get("patient_name")} - ${invoice_data.get("total")}')

# Save updated queue
with open('pcs_ai_data/invoice_queue.json', 'w') as f:
    json.dump(filtered_queue, f, indent=2)

print(f'Final queue size: {len(filtered_queue)}')
