#!/usr/bin/env python3
"""
Reprocess All Invoices

This script retroactively routes all existing invoice PDFs through the 
updated parser pipeline to fix any that were previously parsed incorrectly.

Features:
- Scans email_invoices folder for all PDFs
- Uses the new vendor_detector for smart routing
- Runs appropriate parser for each invoice
- Tracks success/failure statistics
- Can optionally update the invoice queue with new data

Usage:
    python3 reprocess_all_invoices.py [--dry-run] [--limit N] [--vendor VENDOR]
    
Options:
    --dry-run       Don't actually parse, just show what would be done
    --limit N       Only process first N invoices
    --vendor VENDOR Only process invoices for specific vendor
    --update-queue  Update the invoice_queue.json with new parsed data
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EMAIL_INVOICES_DIR = os.path.join(BASE_DIR, 'email_invoices')
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
OUTPUT_JSONS_DIR = os.path.join(DATA_DIR, 'output_jsons')
INVOICE_QUEUE_PATH = os.path.join(DATA_DIR, 'invoice_queue.json')

# Import vendor detector
sys.path.insert(0, BASE_DIR)
try:
    from vendor_detector import detect_vendor, VENDOR_PARSERS
except ImportError:
    print("❌ Could not import vendor_detector. Make sure vendor_detector.py exists.")
    sys.exit(1)


def log(msg: str, level: str = "INFO"):
    """Log with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = {"INFO": "ℹ️", "SUCCESS": "✅", "ERROR": "❌", "WARN": "⚠️", "PROGRESS": "🔄"}.get(level, "")
    print(f"[{timestamp}] {prefix} {msg}")


def get_all_pdfs() -> List[str]:
    """Get all PDF files from email_invoices directory"""
    if not os.path.exists(EMAIL_INVOICES_DIR):
        log(f"Email invoices directory not found: {EMAIL_INVOICES_DIR}", "ERROR")
        return []
    
    pdfs = []
    for f in os.listdir(EMAIL_INVOICES_DIR):
        if f.lower().endswith('.pdf'):
            pdfs.append(os.path.join(EMAIL_INVOICES_DIR, f))
    
    return sorted(pdfs)


def run_parser(pdf_path: str, vendor: str) -> Tuple[bool, Optional[Dict]]:
    """Run the appropriate parser for a vendor"""
    parser_file = VENDOR_PARSERS.get(vendor)
    if not parser_file:
        parser_file = 'general_invoice_parser.py'
    
    parser_path = os.path.join(BASE_DIR, parser_file)
    if not os.path.exists(parser_path):
        return False, None
    
    try:
        env = os.environ.copy()
        env['PCS_DATA_DIR'] = DATA_DIR
        
        result = subprocess.run(
            ['python3', parser_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=90,
            env=env
        )
        
        if result.returncode == 0:
            # Try to find the output JSON
            base_name = Path(pdf_path).stem
            json_path = os.path.join(OUTPUT_JSONS_DIR, f"{base_name}.json")
            
            if os.path.exists(json_path):
                with open(json_path, 'r') as f:
                    parsed_data = json.load(f)
                return True, parsed_data
            
            return True, None
        else:
            return False, None
            
    except subprocess.TimeoutExpired:
        return False, None
    except Exception as e:
        return False, None


def load_invoice_queue() -> Tuple[List[Dict], bool]:
    """Load existing invoice queue. Returns (queue_list, has_wrapper)"""
    if not os.path.exists(INVOICE_QUEUE_PATH):
        return [], False
    
    try:
        with open(INVOICE_QUEUE_PATH, 'r') as f:
            data = json.load(f)
        
        # Handle both formats: list or {invoices: list}
        if isinstance(data, dict) and 'invoices' in data:
            return data['invoices'], True
        elif isinstance(data, list):
            return data, False
        else:
            return [], False
    except Exception as e:
        log(f"Error loading queue: {e}", "ERROR")
        return [], False


def save_invoice_queue(queue: List[Dict], has_wrapper: bool = True):
    """Save updated invoice queue"""
    # Backup first
    if os.path.exists(INVOICE_QUEUE_PATH):
        backup_path = INVOICE_QUEUE_PATH + f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        import shutil
        shutil.copy2(INVOICE_QUEUE_PATH, backup_path)
        log(f"Backed up queue to: {backup_path}")
    
    # Save in same format as loaded
    if has_wrapper:
        data = {"invoices": queue}
    else:
        data = queue
    
    with open(INVOICE_QUEUE_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    
    log(f"Saved updated queue with {len(queue)} invoices", "SUCCESS")


def update_queue_with_parsed_data(queue: List[Dict], pdf_filename: str, parsed_data: Dict) -> bool:
    """Update queue item with newly parsed data"""
    # Find matching queue item by PDF filename
    for item in queue:
        pdf_path = item.get('pdf_path', '') or ''
        source_file = item.get('source_file', '') or ''
        if pdf_filename in pdf_path or pdf_path.endswith(pdf_filename) or pdf_filename == source_file:
            # Update fields from parsed data
            if parsed_data.get('invoice_number'):
                item['invoice_number'] = parsed_data['invoice_number']
            if parsed_data.get('invoice_date'):
                item['invoice_date'] = parsed_data['invoice_date']
            if parsed_data.get('due_date'):
                item['due_date'] = parsed_data['due_date']
            if parsed_data.get('invoice_total'):
                item['invoice_total'] = parsed_data['invoice_total']
            if parsed_data.get('vendor') and parsed_data['vendor'] != 'Unknown':
                item['vendor'] = parsed_data['vendor']
                item['vendor_name'] = parsed_data.get('vendor_name', parsed_data['vendor'])
            if parsed_data.get('office_location'):
                item['office_location'] = parsed_data['office_location']
            if parsed_data.get('line_items'):
                item['line_items'] = parsed_data['line_items']
            
            item['reprocessed_at'] = datetime.now().isoformat()
            return True
    
    return False


def reprocess_invoices(
    dry_run: bool = False,
    limit: Optional[int] = None,
    vendor_filter: Optional[str] = None,
    update_queue: bool = False
):
    """Main reprocessing function"""
    
    log("=" * 60)
    log("INVOICE REPROCESSING STARTED")
    log("=" * 60)
    
    if dry_run:
        log("DRY RUN MODE - No actual parsing will occur", "WARN")
    
    # Get all PDFs
    all_pdfs = get_all_pdfs()
    log(f"Found {len(all_pdfs)} PDF files in email_invoices/")
    
    if limit:
        all_pdfs = all_pdfs[:limit]
        log(f"Limited to first {limit} files")
    
    # Load queue if updating
    queue = []
    has_wrapper = True
    if update_queue:
        queue, has_wrapper = load_invoice_queue()
        log(f"Loaded invoice queue with {len(queue)} items")
    
    # Statistics
    stats = {
        'total': len(all_pdfs),
        'processed': 0,
        'success': 0,
        'failed': 0,
        'skipped': 0,
        'queue_updated': 0,
        'by_vendor': defaultdict(int),
    }
    
    # Process each PDF
    for i, pdf_path in enumerate(all_pdfs):
        filename = os.path.basename(pdf_path)
        progress = f"[{i+1}/{len(all_pdfs)}]"
        
        # Detect vendor
        detection = detect_vendor(pdf_path, confidence_threshold=0.3)
        vendor = detection.vendor
        confidence = detection.confidence
        
        # Apply vendor filter if specified
        if vendor_filter and vendor != vendor_filter:
            stats['skipped'] += 1
            continue
        
        stats['by_vendor'][vendor] += 1
        
        if dry_run:
            log(f"{progress} Would process: {filename} -> {vendor} ({confidence:.0%})")
            stats['processed'] += 1
            continue
        
        # Run parser
        log(f"{progress} Processing: {filename} -> {vendor}", "PROGRESS")
        success, parsed_data = run_parser(pdf_path, vendor)
        
        if success:
            stats['success'] += 1
            
            # Update queue if requested
            if update_queue and parsed_data:
                if update_queue_with_parsed_data(queue, filename, parsed_data):
                    stats['queue_updated'] += 1
        else:
            stats['failed'] += 1
            log(f"  Failed to parse: {filename}", "ERROR")
        
        stats['processed'] += 1
        
        # Progress update every 50 files
        if (i + 1) % 50 == 0:
            log(f"Progress: {stats['success']}/{stats['processed']} successful")
    
    # Save updated queue
    if update_queue and not dry_run and queue:
        save_invoice_queue(queue, has_wrapper)
    
    # Print summary
    log("")
    log("=" * 60)
    log("REPROCESSING COMPLETE")
    log("=" * 60)
    log(f"Total PDFs:     {stats['total']}")
    log(f"Processed:      {stats['processed']}")
    log(f"Successful:     {stats['success']}")
    log(f"Failed:         {stats['failed']}")
    log(f"Skipped:        {stats['skipped']}")
    if update_queue:
        log(f"Queue Updated:  {stats['queue_updated']}")
    
    log("")
    log("By Vendor:")
    for vendor, count in sorted(stats['by_vendor'].items(), key=lambda x: -x[1]):
        log(f"  {vendor}: {count}")
    
    # Save stats to file
    stats_path = os.path.join(BASE_DIR, 'reprocess_stats.json')
    stats_output = {
        'run_at': datetime.now().isoformat(),
        'dry_run': dry_run,
        'stats': {
            'total': stats['total'],
            'processed': stats['processed'],
            'success': stats['success'],
            'failed': stats['failed'],
            'skipped': stats['skipped'],
            'queue_updated': stats['queue_updated'],
        },
        'by_vendor': dict(stats['by_vendor']),
    }
    
    with open(stats_path, 'w') as f:
        json.dump(stats_output, f, indent=2)
    
    log(f"\nStats saved to: {stats_path}")
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Reprocess all invoice PDFs through the updated parser pipeline"
    )
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help="Don't actually parse, just show what would be done"
    )
    parser.add_argument(
        '--limit', 
        type=int,
        help="Only process first N invoices"
    )
    parser.add_argument(
        '--vendor',
        type=str,
        help="Only process invoices for specific vendor"
    )
    parser.add_argument(
        '--update-queue',
        action='store_true',
        help="Update the invoice_queue.json with new parsed data"
    )
    
    args = parser.parse_args()
    
    reprocess_invoices(
        dry_run=args.dry_run,
        limit=args.limit,
        vendor_filter=args.vendor,
        update_queue=args.update_queue
    )


if __name__ == '__main__':
    main()

