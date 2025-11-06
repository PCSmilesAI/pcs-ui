#!/usr/bin/env python3
"""
Vendor Router - Routes PDF invoices to appropriate vendor parsers
"""

import os
import sys
import subprocess
import json
import time
from datetime import datetime

PARSER_FOLDER = os.path.dirname(__file__)

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_FOLDER = os.path.join(DATA_DIR, "output_jsons/")
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
            # Pass environment variables to parser subprocess
            env = os.environ.copy()
            env['PCS_DATA_DIR'] = DATA_DIR

            result = subprocess.run(
                ["python3", parser_path, filepath],
                capture_output=True,
                text=True,
                timeout=30,
                env=env
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
        # Pass environment variables to parser subprocess
        env = os.environ.copy()
        env['PCS_DATA_DIR'] = DATA_DIR

        result = subprocess.run(
            ["python3", parser_path, filepath],
            capture_output=True,
            text=True,
            timeout=30,
            env=env
        )
        return result.returncode == 0
    except Exception:
        return False

def find_latest_json_file():
    """Find the most recently created JSON file in output_jsons"""
    if not os.path.exists(OUTPUT_FOLDER):
        return None

    try:
        json_files = [f for f in os.listdir(OUTPUT_FOLDER) if f.endswith('.json')]
        if not json_files:
            return None

        # Sort by modification time, most recent first
        json_files.sort(key=lambda f: os.path.getmtime(os.path.join(OUTPUT_FOLDER, f)), reverse=True)
        return os.path.join(OUTPUT_FOLDER, json_files[0])
    except Exception:
        return None

def call_queue_writer(filepath, vendor):
    """Call invoice_queue_writer to add invoice to queue"""
    if not os.path.exists(QUEUE_WRITER):
        return False

    try:
        # Wait a moment for the JSON file to be created
        time.sleep(0.5)

        # Find the most recently created JSON file
        json_path = find_latest_json_file()
        if json_path:
            result = subprocess.run(
                ["python3", QUEUE_WRITER, json_path, vendor],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        return False
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

    vendor = None

    # If vendor was detected from email, try that first
    if detected_vendor and detected_vendor in VENDOR_PARSERS:
        if run_parser(filepath, detected_vendor):
            vendor = detected_vendor

    # Otherwise, try to detect vendor from PDF content
    if not vendor:
        vendor = detect_vendor_from_pdf(filepath)

    # If no vendor detected, run general parser fallback
    if not vendor:
        general_parser = os.path.join(PARSER_FOLDER, 'general_invoice_parser.py')
        if os.path.exists(general_parser):
            try:
                # Pass environment variables to parser subprocess
                env = os.environ.copy()
                env['PCS_DATA_DIR'] = DATA_DIR

                result = subprocess.run(
                    ["python3", general_parser, filepath],
                    capture_output=True,
                    text=True,
                    timeout=90,
                    env=env
                )
                if result.returncode == 0:
                    vendor = "general"
            except Exception:
                pass

    # If we found a vendor, call queue writer to add to invoice queue
    if vendor:
        call_queue_writer(filepath, vendor)
        print(vendor)
        sys.exit(0)
    else:
        print("unknown", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
