#!/usr/bin/env python3
"""
Check current status of invoice queue after improvements.
Shows PDF mapping success rate, line items availability, and invoice clickability status.
"""

import json
import os
from collections import Counter

def check_invoice_status():
    """Analyze the current invoice queue status."""
    
    queue_file = 'pcs_ai_data/invoice_queue.json'
    
    if not os.path.exists(queue_file):
        print(f"❌ Queue file not found: {queue_file}")
        return
    
    # Load current queue
    with open(queue_file, 'r') as f:
        invoices = json.load(f)
    
    print(f"📊 Invoice Queue Analysis")
    print(f"=" * 50)
    print(f"Total invoices: {len(invoices)}")
    print()
    
    # PDF mapping analysis
    has_pdf = sum(1 for inv in invoices if inv.get('pdf_path'))
    no_pdf = len(invoices) - has_pdf
    pdf_success_rate = (has_pdf / len(invoices)) * 100 if invoices else 0
    
    print(f"📄 PDF Mapping Status:")
    print(f"  ✅ Has PDF: {has_pdf} invoices ({pdf_success_rate:.1f}%)")
    print(f"  ❌ No PDF: {no_pdf} invoices ({100-pdf_success_rate:.1f}%)")
    print()
    
    # Line items analysis
    has_line_items = sum(1 for inv in invoices if inv.get('line_items') and len(inv['line_items']) > 0)
    no_line_items = len(invoices) - has_line_items
    line_items_success_rate = (has_line_items / len(invoices)) * 100 if invoices else 0
    
    print(f"📋 Line Items Status:")
    print(f"  ✅ Has line items: {has_line_items} invoices ({line_items_success_rate:.1f}%)")
    print(f"  ❌ No line items: {no_line_items} invoices ({100-line_items_success_rate:.1f}%)")
    print()
    
    # Clickability analysis (invoices need either invoice_number OR id)
    clickable = sum(1 for inv in invoices if 
                   (inv.get('invoice_number') and inv['invoice_number'].strip()) or 
                   inv.get('id'))
    non_clickable = len(invoices) - clickable
    clickable_rate = (clickable / len(invoices)) * 100 if invoices else 0
    
    print(f"🖱️  Invoice Clickability:")
    print(f"  ✅ Clickable: {clickable} invoices ({clickable_rate:.1f}%)")
    print(f"  ❌ Not clickable: {non_clickable} invoices ({100-clickable_rate:.1f}%)")
    print()
    
    # Vendor breakdown
    vendor_counts = Counter()
    for inv in invoices:
        vendor = inv.get('vendor_name') or inv.get('vendor') or 'Unknown'
        vendor_counts[vendor] += 1
    
    print(f"🏢 Vendor Breakdown:")
    for vendor, count in vendor_counts.most_common():
        print(f"  • {vendor}: {count} invoices")
    print()
    
    # Status breakdown
    status_counts = Counter()
    for inv in invoices:
        status = inv.get('status') or 'Unknown'
        status_counts[status] += 1
    
    print(f"📈 Status Breakdown:")
    for status, count in status_counts.most_common():
        print(f"  • {status}: {count} invoices")
    print()
    
    # Quality score summary
    print(f"🎯 Data Quality Summary:")
    complete_invoices = sum(1 for inv in invoices if 
                           inv.get('pdf_path') and 
                           inv.get('line_items') and 
                           len(inv['line_items']) > 0 and
                           inv.get('invoice_number'))
    quality_rate = (complete_invoices / len(invoices)) * 100 if invoices else 0
    print(f"  ⭐ Complete (PDF + Line Items + Invoice #): {complete_invoices} ({quality_rate:.1f}%)")
    
    # List invoices with issues for debugging
    print(f"\n🔍 Invoices with Issues:")
    issue_count = 0
    for inv in invoices:
        issues = []
        if not inv.get('pdf_path'):
            issues.append('No PDF')
        if not inv.get('line_items') or len(inv['line_items']) == 0:
            issues.append('No line items')
        if not inv.get('invoice_number') or not inv['invoice_number'].strip():
            issues.append('No invoice number')
        
        if issues:
            issue_count += 1
            vendor = inv.get('vendor_name', inv.get('vendor', 'Unknown'))
            invoice_id = inv.get('invoice_number', inv.get('id', 'N/A'))
            print(f"  • {vendor} #{invoice_id}: {', '.join(issues)}")
    
    if issue_count == 0:
        print(f"  🎉 No issues found! All invoices have complete data.")
    
    print(f"\n✅ Analysis complete. Queue appears {('healthy' if quality_rate > 70 else 'needs attention')}.")
    
    return {
        'total': len(invoices),
        'pdf_success_rate': pdf_success_rate,
        'line_items_success_rate': line_items_success_rate,
        'clickable_rate': clickable_rate,
        'quality_rate': quality_rate
    }

if __name__ == "__main__":
    check_invoice_status()
