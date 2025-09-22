#!/usr/bin/env python3
import json

# Load current queue
with open('pcs_ai_data/invoice_queue.json', 'r') as f:
    current_queue = json.load(f)

# Load original TC Dental invoices
with open('original_tc_dental.json', 'r') as f:
    original_tc_data = f.read()

# Parse the original TC Dental invoices (they're separate JSON objects)
original_tc_invoices = []
for line in original_tc_data.strip().split('\n'):
    if line.strip():
        try:
            original_tc_invoices.append(json.loads(line))
        except:
            continue

print(f'Current queue size: {len(current_queue)}')
print(f'Original TC Dental invoices to restore: {len(original_tc_invoices)}')

# Add original TC Dental invoices back
for inv in original_tc_invoices:
    current_queue.append(inv)
    print(f'Restored: {inv.get("invoice_number")} - ${inv.get("total")}')

# Save updated queue
with open('pcs_ai_data/invoice_queue.json', 'w') as f:
    json.dump(current_queue, f, indent=2)

print(f'Final queue size: {len(current_queue)}')
print('✅ Original TC Dental invoices restored!')
