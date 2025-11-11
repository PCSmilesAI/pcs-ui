#!/usr/bin/env python3
"""
Multi-Invoice Detector - Detects and handles PDFs containing multiple invoices
"""

import os
import json
import subprocess
from datetime import datetime

def log(msg):
    """Log messages with timestamp"""
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}")

def detect_multiple_invoices(pdf_path, vendor):
    """
    Detect if a PDF contains multiple invoices by analyzing the parser output.
    Returns list of invoice data if multiple invoices detected, None otherwise.
    """
    try:
        # Get the parser for this vendor
        parser_map = {
            'epic': 'epic_parser.py',
            'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
            'henry': 'henry_parser.py',
            'exodus': 'exodus_parser.py',
            'artisan': 'parse_artisan_dental_exporting_fixed.py',
            'tc': 'parse_tc_dental_invoice.py'
        }
        
        parser_name = parser_map.get(vendor)
        if not parser_name:
            return None
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        parser_path = os.path.join(base_dir, parser_name)
        
        if not os.path.exists(parser_path):
            return None
        
        # Run parser with multi-invoice detection flag
        env = os.environ.copy()
        env['DETECT_MULTIPLE_INVOICES'] = '1'
        
        result = subprocess.run(
            ["python3", parser_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=60,
            env=env
        )
        
        if result.returncode != 0:
            return None
        
        # Try to parse output as JSON array
        try:
            output = result.stdout.strip()
            # Check if output contains multiple JSON objects
            if output.startswith('['):
                invoices = json.loads(output)
                if isinstance(invoices, list) and len(invoices) > 1:
                    log(f"🔍 Detected {len(invoices)} invoices in {os.path.basename(pdf_path)}")
                    return invoices
        except json.JSONDecodeError:
            pass
        
        return None
    except Exception as e:
        log(f"⚠️ Error detecting multiple invoices: {e}")
        return None

def process_multi_invoice_pdf(pdf_path, vendor, source_message_id):
    """
    Process a PDF with multiple invoices.
    Creates separate invoice records with the same PDF reference.
    Returns list of invoice data to ingest.
    """
    invoices = detect_multiple_invoices(pdf_path, vendor)
    
    if not invoices:
        return None
    
    # Prepare invoices for ingestion
    prepared_invoices = []
    for idx, invoice_data in enumerate(invoices):
        # Ensure each invoice has required fields
        if not invoice_data.get('invoice_number'):
            log(f"⚠️ Invoice {idx} missing invoice_number, skipping")
            continue
        
        # Add PDF reference and source info
        invoice_data['pdf_path'] = pdf_path
        invoice_data['source_message_id'] = f"{source_message_id}_invoice_{idx}"
        invoice_data['source_file'] = os.path.basename(pdf_path)
        
        prepared_invoices.append(invoice_data)
    
    if prepared_invoices:
        log(f"✅ Prepared {len(prepared_invoices)} invoices from multi-invoice PDF")
    
    return prepared_invoices if prepared_invoices else None

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 multi_invoice_detector.py <pdf_path> <vendor> [source_message_id]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    vendor = sys.argv[2]
    source_message_id = sys.argv[3] if len(sys.argv) > 3 else "unknown"
    
    result = process_multi_invoice_pdf(pdf_path, vendor, source_message_id)
    if result:
        print(json.dumps(result))
        sys.exit(0)
    else:
        sys.exit(1)

