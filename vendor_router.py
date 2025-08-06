#!/usr/bin/env python3
"""
Vendor Router - Routes PDF invoices to appropriate vendor parsers
"""

import os
import sys
import subprocess
import json
from datetime import datetime

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
        print("Usage: python3 vendor_router.py <pdf_filepath> [detected_vendor]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    detected_vendor = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)
    
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
