#!/usr/bin/env python3
"""
Vendor Router - Routes PDF invoices to appropriate vendor parsers

This version uses confidence-based vendor detection via vendor_detector.py
for smarter routing decisions.
"""

import os
import sys
import subprocess
import json
import time
from datetime import datetime

PARSER_FOLDER = os.path.dirname(__file__)
MULTI_INVOICE_DETECTOR = os.path.join(PARSER_FOLDER, "multi_invoice_detector.py")

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_FOLDER = os.path.join(DATA_DIR, "output_jsons/")
QUEUE_WRITER = os.path.join(PARSER_FOLDER, "invoice_queue_writer.py")

# Complete vendor parser mappings (including new parsers)
VENDOR_PARSERS = {
    'epic': 'epic_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'henry': 'henry_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py',
    'darby': 'darby_parser.py',
    'dandy': 'dandy_parser.py',
    'brasseler': 'brasseler_parser.py',
    'ctr_services': 'ctr_services_parser.py',
    'a1_professional': 'a1_professional_parser.py',
    'comcast': 'comcast_parser.py',
    'bridgeford': 'bridgeford_parser.py',
    'general': 'general_invoice_parser.py',
}

# Confidence threshold for routing (0-1)
CONFIDENCE_THRESHOLD = 0.5


def detect_vendor_smart(filepath):
    """
    Use vendor_detector.py for confidence-based vendor detection.
    Returns (vendor, confidence) tuple.
    """
    try:
        from vendor_detector import detect_vendor
        result = detect_vendor(filepath, CONFIDENCE_THRESHOLD)
        return result.vendor, result.confidence, result.parser_file
    except ImportError:
        # Fallback to legacy detection if vendor_detector not available
        return detect_vendor_legacy(filepath), 0.5, None
    except Exception as e:
        print(f"⚠️ Smart detection error: {e}", file=sys.stderr)
        return None, 0.0, None


def detect_vendor_legacy(filepath):
    """
    Legacy vendor detection - runs parsers sequentially.
    Kept for backward compatibility.
    """
    for vendor, parser in VENDOR_PARSERS.items():
        if vendor == 'general':
            continue  # Skip general parser in detection
            
        parser_path = os.path.join(PARSER_FOLDER, parser)
        if not os.path.exists(parser_path):
            continue
            
        try:
            env = os.environ.copy()
            env['PCS_DATA_DIR'] = DATA_DIR

            result = subprocess.run(
                ["python3", parser_path, filepath],
                capture_output=True,
                text=True,
                timeout=30,
                env=env
            )

            if result.returncode == 0:
                # Check for successful parsing indicators
                stdout_lower = result.stdout.lower()
                if vendor in stdout_lower or "invoice parsed" in stdout_lower:
                    return vendor
                if "vendor" in result.stdout and "invoice_number" in result.stdout:
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
        print(f"⚠️ No parser found for vendor: {vendor}", file=sys.stderr)
        return False

    parser_path = os.path.join(PARSER_FOLDER, parser)
    if not os.path.exists(parser_path):
        print(f"⚠️ Parser file not found: {parser_path}", file=sys.stderr)
        return False

    try:
        env = os.environ.copy()
        env['PCS_DATA_DIR'] = DATA_DIR

        result = subprocess.run(
            ["python3", parser_path, filepath],
            capture_output=True,
            text=True,
            timeout=60,
            env=env
        )
        
        if result.returncode == 0:
            print(f"✅ {vendor} parser succeeded", file=sys.stderr)
            return True
        else:
            print(f"❌ {vendor} parser failed: {result.stderr}", file=sys.stderr)
            return False
    except subprocess.TimeoutExpired:
        print(f"⏱️ {vendor} parser timed out", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Error running {vendor} parser: {e}", file=sys.stderr)
        return False


def find_latest_json_file():
    """Find the most recently created JSON file in output_jsons"""
    if not os.path.exists(OUTPUT_FOLDER):
        return None

    try:
        json_files = [f for f in os.listdir(OUTPUT_FOLDER) if f.endswith('.json')]
        if not json_files:
            return None

        json_files.sort(key=lambda f: os.path.getmtime(os.path.join(OUTPUT_FOLDER, f)), reverse=True)
        return os.path.join(OUTPUT_FOLDER, json_files[0])
    except Exception:
        return None


def call_queue_writer(filepath, vendor):
    """Call invoice_queue_writer to add invoice to queue"""
    if not os.path.exists(QUEUE_WRITER):
        return False

    try:
        time.sleep(0.5)
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


def handle_multi_invoice_pdf(filepath, vendor, source_message_id):
    """
    Check if PDF contains multiple invoices and handle accordingly.
    Returns True if multi-invoice PDF was processed, False otherwise.
    """
    if not os.path.exists(MULTI_INVOICE_DETECTOR):
        return False

    try:
        result = subprocess.run(
            ["python3", MULTI_INVOICE_DETECTOR, filepath, vendor, source_message_id],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode == 0:
            invoices = json.loads(result.stdout.strip())
            if isinstance(invoices, list) and len(invoices) > 1:
                print(f"📦 Processing {len(invoices)} invoices from multi-invoice PDF", file=sys.stderr)
                return True
    except Exception:
        pass

    return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 vendor_router.py <pdf_filepath> [detected_vendor] [source_message_id]")
        sys.exit(1)

    filepath = sys.argv[1]
    detected_vendor = sys.argv[2] if len(sys.argv) > 2 else None
    source_message_id = sys.argv[3] if len(sys.argv) > 3 else "unknown"

    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    vendor = None
    confidence = 0.0

    # Step 1: If vendor was pre-detected from email, try that first
    if detected_vendor and detected_vendor in VENDOR_PARSERS:
        print(f"🔄 Trying pre-detected vendor: {detected_vendor}", file=sys.stderr)
        if run_parser(filepath, detected_vendor):
            vendor = detected_vendor
            confidence = 0.9  # High confidence since email detection + parser success

    # Step 2: Use smart vendor detection
    if not vendor:
        print(f"🔍 Running smart vendor detection...", file=sys.stderr)
        vendor, confidence, parser_file = detect_vendor_smart(filepath)
        
        if vendor and vendor != 'unknown' and confidence >= CONFIDENCE_THRESHOLD:
            print(f"📊 Detected: {vendor} (confidence: {confidence:.0%})", file=sys.stderr)
            if run_parser(filepath, vendor):
                pass  # Success, vendor is set
            else:
                # Parser failed, try fallback
                print(f"⚠️ {vendor} parser failed, trying fallback...", file=sys.stderr)
                vendor = None

    # Step 3: Fallback to general parser
    if not vendor or vendor == 'unknown':
        print(f"📄 Using general parser fallback...", file=sys.stderr)
        if run_parser(filepath, 'general'):
            vendor = "general"
            confidence = 0.3
        else:
            print("unknown", file=sys.stderr)
            sys.exit(1)

    # Step 4: Handle multi-invoice PDFs
    if vendor:
        if handle_multi_invoice_pdf(filepath, vendor, source_message_id):
            print(vendor)
            sys.exit(0)

        # Step 5: Add to queue
        call_queue_writer(filepath, vendor)
        print(vendor)
        sys.exit(0)
    else:
        print("unknown", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
