#!/usr/bin/env python3
"""
Deduplication script for invoice queue.
Removes duplicate invoices based on vendor_name + invoice_number + invoice_date.
Keeps the invoice with the best data quality (most line items, has PDF, etc.)
"""

import json
import os
from datetime import datetime
from collections import defaultdict

def deduplicate_invoices():
    """Remove duplicate invoices from the invoice queue."""
    
    queue_file = 'pcs_ai_data/invoice_queue.json'
    backup_file = f'pcs_ai_data/invoice_queue_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    
    # Create backup
    if os.path.exists(queue_file):
        print(f"📦 Creating backup: {backup_file}")
        with open(queue_file, 'r') as f:
            backup_data = json.load(f)
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
    else:
        print(f"❌ File not found: {queue_file}")
        return
    
    # Load current queue
    with open(queue_file, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Starting with {len(invoices)} invoices")
    
    # Group invoices by unique key
    groups = defaultdict(list)
    
    for invoice in invoices:
        # Create unique key for deduplication
        vendor = invoice.get('vendor_name', '').strip()
        invoice_num = invoice.get('invoice_number', '').strip()
        date = invoice.get('invoice_date', '').strip()
        
        # Create a composite key - handle empty invoice numbers
        if invoice_num:
            key = f"{vendor}|{invoice_num}|{date}".lower()
        else:
            # For invoices without numbers, use more specific key
            total = invoice.get('invoice_total', '')
            office = invoice.get('office_location', '')
            key = f"{vendor}|no_number|{date}|{total}|{office}".lower()
        
        groups[key].append(invoice)
    
    # Find duplicates and select best version
    deduplicated_invoices = []
    duplicate_count = 0
    
    for key, group in groups.items():
        if len(group) == 1:
            # No duplicates, keep as is
            deduplicated_invoices.extend(group)
        else:
            # Multiple invoices with same key, select the best one
            print(f"🔍 Found {len(group)} duplicates for key: {key}")
            
            # Score each invoice based on data quality
            scored_invoices = []
            for invoice in group:
                score = 0
                
                # Has PDF file
                if invoice.get('pdf_path'):
                    score += 10
                
                # Has line items
                line_items = invoice.get('line_items', [])
                if line_items and len(line_items) > 0:
                    score += 5 + len(line_items)  # Base 5 + number of items
                
                # Has complete data
                if invoice.get('invoice_total'):
                    score += 3
                if invoice.get('office_location'):
                    score += 2
                if invoice.get('vendor_name'):
                    score += 2
                
                # More recent processing (based on source_file timestamp if available)
                source_file = invoice.get('source_file', '')
                if 'email_' in source_file:
                    try:
                        # Extract timestamp from filename like email_2_20250805_230044_...
                        parts = source_file.split('_')
                        if len(parts) >= 4:
                            date_part = parts[2]  # 20250805
                            time_part = parts[3]  # 230044
                            score += 1  # Slight preference for newer files
                    except:
                        pass
                
                scored_invoices.append((score, invoice))
            
            # Sort by score (highest first) and take the best one
            scored_invoices.sort(key=lambda x: x[0], reverse=True)
            best_invoice = scored_invoices[0][1]
            
            print(f"  → Keeping invoice with score {scored_invoices[0][0]} (ID: {best_invoice.get('id', 'N/A')})")
            print(f"    PDF: {'✅' if best_invoice.get('pdf_path') else '❌'}")
            print(f"    Line items: {len(best_invoice.get('line_items', []))}")
            
            deduplicated_invoices.append(best_invoice)
            duplicate_count += len(group) - 1
    
    # Save deduplicated queue
    with open(queue_file, 'w') as f:
        json.dump(deduplicated_invoices, f, indent=2)
    
    print(f"\n🎉 Deduplication complete!")
    print(f"📊 Original count: {len(invoices)} invoices")
    print(f"❌ Removed duplicates: {duplicate_count} invoices")
    print(f"✅ Final count: {len(deduplicated_invoices)} invoices")
    print(f"💾 Backup saved to: {backup_file}")
    print(f"💾 Cleaned data saved to: {queue_file}")
    
    return len(deduplicated_invoices)

if __name__ == "__main__":
    deduplicate_invoices()
