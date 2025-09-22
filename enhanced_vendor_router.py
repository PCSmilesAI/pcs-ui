#!/usr/bin/env python3
"""
Enhanced Vendor Router - Handles both single-page and multi-page invoices
"""

import os
import sys
import subprocess
import json
from datetime import datetime
from multipage_invoice_processor import MultiPageInvoiceProcessor

PARSER_FOLDER = os.path.dirname(__file__)
OUTPUT_FOLDER = os.path.join(PARSER_FOLDER, "output_jsons/")
QUEUE_WRITER = os.path.join(PARSER_FOLDER, "invoice_queue_writer.py")

# Vendor parser mappings
VENDOR_PARSERS = {
    'epic': 'epic_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'henry': 'henry_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py'
}

def is_multi_page_invoice(pdf_path: str) -> bool:
    """
    Check if a PDF is likely to contain multiple separate invoices
    """
    try:
        import fitz
        doc = fitz.open(pdf_path)
        page_count = len(doc)
        doc.close()
        
        # If more than 3 pages, likely multi-page
        return page_count > 3
    except:
        return False

def detect_vendor_from_pdf(filepath):
    """Detect vendor by running all parsers and seeing which one succeeds"""
    for vendor, parser in VENDOR_PARSERS.items():
        parser_path = os.path.join(PARSER_FOLDER, parser)
        if not os.path.exists(parser_path):
            continue
            
        try:
            result = subprocess.run(
                ["python3", parser_path, filepath],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Check for successful parsing based on vendor-specific indicators
            if result.returncode == 0:
                if vendor == 'epic' and "Extracted" in result.stdout:
                    return vendor
                elif vendor == 'henry' and ("Henry schein" in result.stdout or "Henry Schein" in result.stdout):
                    return vendor
                elif vendor == 'patterson' and ("Patterson" in result.stdout):
                    return vendor
                elif vendor == 'exodus' and ("Exodus" in result.stdout):
                    return vendor
                elif vendor == 'artisan' and ("Artisan" in result.stdout):
                    return vendor
                elif vendor == 'tc' and ("TC" in result.stdout or "T.C." in result.stdout):
                    return vendor
                # For other vendors, check if they output valid JSON
                elif "vendor" in result.stdout and "invoice_number" in result.stdout:
                    return vendor
                    
        except subprocess.TimeoutExpired:
            continue
        except Exception:
            continue
    
    return None

def process_multi_page_invoice(filepath, vendor):
    """
    Process a multi-page PDF that contains multiple invoices
    """
    print(f"🔄 Processing multi-page {vendor} PDF: {os.path.basename(filepath)}")
    
    try:
        processor = MultiPageInvoiceProcessor(filepath)
        invoices = processor.process_all_invoices()
        processor.close()
        
        if invoices:
            print(f"✅ Successfully extracted {len(invoices)} invoices from multi-page PDF")
            return True
        else:
            print(f"❌ No invoices extracted from multi-page PDF")
            return False
            
    except Exception as e:
        print(f"❌ Error processing multi-page PDF: {e}")
        return False

def run_parser(filepath, vendor):
    """Run the appropriate vendor parser"""
    parser = VENDOR_PARSERS.get(vendor)
    if not parser:
        return False
        
    parser_path = os.path.join(PARSER_FOLDER, parser)
    if not os.path.exists(parser_path):
        return False
        
    try:
        result = subprocess.run(
            ["python3", parser_path, filepath],
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode == 0
    except Exception:
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 enhanced_vendor_router.py <pdf_filepath> [detected_vendor]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    detected_vendor = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)
    
    # Check if this is a multi-page invoice
    if is_multi_page_invoice(filepath):
        print(f"📄 Multi-page PDF detected: {os.path.basename(filepath)}")
        
        # For TC Dental, use the multi-page processor
        if detected_vendor == 'tc' or 'tc' in filepath.lower():
            if process_multi_page_invoice(filepath, 'tc'):
                print("tc_multipage")
                sys.exit(0)
            else:
                print("unknown", file=sys.stderr)
                sys.exit(1)
        
        # For other vendors, try regular parsing first
        if detected_vendor and detected_vendor in VENDOR_PARSERS:
            if run_parser(filepath, detected_vendor):
                print(detected_vendor)
                sys.exit(0)
    
    # If vendor was detected from email, try that first
    if detected_vendor and detected_vendor in VENDOR_PARSERS:
        if run_parser(filepath, detected_vendor):
            print(detected_vendor)
            sys.exit(0)
    
    # Otherwise, try to detect vendor from PDF content
    vendor = detect_vendor_from_pdf(filepath)
    if vendor:
        print(vendor)
        sys.exit(0)
    
    # If no vendor detected, exit with error
    print("unknown", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    main()
