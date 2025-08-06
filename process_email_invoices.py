#!/usr/bin/env python3
"""
Process Email Invoices Script
Processes all existing PDFs in the email_invoices/ folder and runs them through the vendor router.
This is useful when you have PDFs already downloaded but need to parse them and add to the UI.
"""

import os
import sys
import subprocess
import json
from datetime import datetime
import glob

def log(msg):
    """Custom logging function"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_parser_file(vendor):
    """Get the parser file for a given vendor"""
    parser_mapping = {
        'epic': 'epic_parser.py',
        'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
        'henry': 'henry_parser.py',
        'exodus': 'exodus_parser.py',
        'artisan': 'parse_artisan_dental_exporting_fixed.py',
        'tc': 'parse_tc_dental_invoice.py'
    }
    
    parser_file = parser_mapping.get(vendor)
    if parser_file and os.path.exists(parser_file):
        return parser_file
    return None

def run_vendor_router(filepath):
    """Run the vendor router to process the PDF and generate JSON output"""
    try:
        # First, run vendor router to detect vendor
        cmd = ['python3', 'vendor_router.py', filepath]
        
        log(f"🔄 Running vendor router: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            vendor = result.stdout.strip()
            log(f"✅ Vendor detected: {vendor}")
            
            # Now run the actual parser to generate JSON
            if vendor and vendor != "unknown":
                parser_file = get_parser_file(vendor)
                if parser_file:
                    log(f"🔧 Running {vendor} parser: {parser_file}")
                    parser_result = subprocess.run(
                        ['python3', parser_file, filepath],
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    if parser_result.returncode == 0:
                        log(f"✅ {vendor} parser completed successfully")
                        if "Extracted" in parser_result.stdout:
                            log(f"📊 JSON generated for {vendor} invoice")
                        else:
                            log(f"⚠️ Parser ran but may not have extracted data")
                        return True
                    else:
                        log(f"❌ {vendor} parser failed: {parser_result.stderr}")
                        return False
                else:
                    log(f"❌ No parser found for vendor: {vendor}")
                    return False
            else:
                log(f"❓ Unknown vendor, skipping parsing")
                return False
        else:
            log(f"❌ Vendor router failed: {result.stderr}")
            return False
        
    except subprocess.TimeoutExpired:
        log(f"⏰ Vendor router timed out")
        return False
    except Exception as e:
        log(f"❌ Error running vendor router: {e}")
        return False

def process_email_invoices():
    """Process all PDFs in the email_invoices folder"""
    try:
        log("🚀 Starting to process email_invoices folder...")
        
        # Check if email_invoices folder exists
        if not os.path.exists("email_invoices"):
            log("❌ email_invoices folder not found")
            return
        
        # Find all PDF files
        pdf_files = glob.glob("email_invoices/*.pdf")
        
        if not pdf_files:
            log("📭 No PDF files found in email_invoices folder")
            return
        
        log(f"📊 Found {len(pdf_files)} PDF files to process")
        
        processed_count = 0
        failed_count = 0
        
        # Process each PDF
        for i, pdf_file in enumerate(pdf_files, 1):
            try:
                filename = os.path.basename(pdf_file)
                log(f"📄 Processing {i}/{len(pdf_files)}: {filename}")
                
                # Run vendor router
                if run_vendor_router(pdf_file):
                    processed_count += 1
                    log(f"✅ Successfully processed: {filename}")
                else:
                    failed_count += 1
                    log(f"❌ Failed to process: {filename}")
                
            except Exception as e:
                failed_count += 1
                log(f"❌ Error processing {filename}: {e}")
                continue
        
        # Summary
        log("=" * 50)
        log(f"📊 PROCESSING COMPLETE")
        log(f"📄 Total PDFs found: {len(pdf_files)}")
        log(f"✅ Successfully processed: {processed_count}")
        log(f"❌ Failed to process: {failed_count}")
        
        # Count generated JSON files
        json_count = 0
        if os.path.exists("output_jsons"):
            json_files = [f for f in os.listdir("output_jsons") if f.endswith('.json')]
            json_count = len(json_files)
        
        log(f"📄 Total JSON files: {json_count}")
        log(f"📁 Check 'output_jsons/' for parsed results")
        log(f"📋 Check 'invoice_queue.json' for queue status")
        log("=" * 50)
        
    except Exception as e:
        log(f"❌ Error in process_email_invoices: {e}")

def main():
    """Main function"""
    log("🎯 PCS AI - Process Email Invoices")
    log("=" * 50)
    
    # Check if required files exist
    required_files = ['vendor_router.py', 'epic_parser.py', 'henry_parser.py']
    missing_files = []
    
    for file in required_files:
        if not os.path.exists(file):
            missing_files.append(file)
    
    if missing_files:
        log(f"❌ Missing required files: {', '.join(missing_files)}")
        log("Please ensure all parser files are in the current directory")
        return
    
    # Process email invoices
    process_email_invoices()

if __name__ == "__main__":
    main() 