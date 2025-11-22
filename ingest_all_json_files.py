#!/usr/bin/env python3
"""
One-Time Script: Ingest All JSON Files
Processes all JSON files in output_jsons directory and ingests them into the database.
"""

import os
import json
import time
import subprocess
from datetime import datetime

# Try to import requests, fall back to curl if not available
try:
    import requests
    USE_REQUESTS = True
except ImportError:
    USE_REQUESTS = False

# Try to import deleted_invoice_guard
try:
    from deleted_invoice_guard import compute_file_hash, should_skip_deleted_invoice
    HAS_DELETED_GUARD = True
except ImportError:
    HAS_DELETED_GUARD = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, DATA_DIR))

OUTPUT_JSONS_PATH = os.path.join(DATA_DIR, "output_jsons")
EMAIL_INVOICES_PATH = os.path.join(DATA_DIR, "email_invoices")
API_BASE_URL = os.environ.get('PCS_API_URL', 'http://localhost:3000')
INGEST_ENDPOINT = f"{API_BASE_URL}/api/invoices/ingest"

def log(msg):
    """Log messages"""
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}")

def find_corresponding_pdf(json_filename):
    """Find the PDF file that corresponds to a JSON file"""
    base_name = json_filename.replace('.json', '')
    
    # First try exact match
    exact_pdf = os.path.join(EMAIL_INVOICES_PATH, base_name + '.pdf')
    if os.path.exists(exact_pdf):
        return exact_pdf
    
    # Look for PDFs that contain the base name
    if os.path.exists(EMAIL_INVOICES_PATH):
        for pdf_file in os.listdir(EMAIL_INVOICES_PATH):
            if pdf_file.endswith('.pdf') and base_name in pdf_file:
                return os.path.join(EMAIL_INVOICES_PATH, pdf_file)
    
    return None

def ingest_json_file(json_file_path):
    """Ingest a single JSON file into the database"""
    try:
        # Load JSON data
        with open(json_file_path, 'r') as f:
            invoice_data = json.load(f)

        # Extract invoice information - use fallbacks for missing fields
        json_filename = os.path.basename(json_file_path)
        source_file = invoice_data.get('source_file') or json_filename
        
        # Use fallback values - ingest ALL invoices even with missing data
        invoice_number = invoice_data.get('invoice_number', '')
        if not invoice_number:
            # Try to extract from filename or use filename as fallback
            base_name = json_filename.replace('.json', '')
            # Remove hash suffixes (e.g., _abc12345)
            import re
            base_name = re.sub(r'_[a-f0-9]{8}$', '', base_name)
            invoice_number = base_name or f"UNKNOWN-{int(time.time())}"
        
        vendor = invoice_data.get('vendor', '')
        if not vendor:
            vendor = 'Unknown Vendor'
        
        total = invoice_data.get('total', '') or invoice_data.get('invoice_total', '')
        office_location = invoice_data.get('office_location', '')
        invoice_date = invoice_data.get('invoice_date', '')

        # Normalize vendor name
        vendor_lower = vendor.lower()
        if 'henry' in vendor_lower or 'henryschein' in vendor_lower:
            vendor = 'Henry Schein'
        elif 'epic' in vendor_lower:
            vendor = 'Epic Dental Lab'
        elif 'patterson' in vendor_lower:
            vendor = 'Patterson Dental'
        elif 'exodus' in vendor_lower:
            vendor = 'Exodus Dental Solutions'
        elif 'artisan' in vendor_lower:
            vendor = 'Artisan Dental'
        elif 'tc' in vendor_lower and 'dental' in vendor_lower:
            vendor = 'TC Dental'

        # Find PDF path
        pdf_path = find_corresponding_pdf(json_filename)

        # Check if should skip deleted invoice (if module available)
        if HAS_DELETED_GUARD and pdf_path:
            try:
                file_hash = compute_file_hash(pdf_path)
                skip_deleted, skip_reason = should_skip_deleted_invoice(
                    vendor=vendor,
                    invoice_number=invoice_number,
                    pdf_path=pdf_path,
                    file_hash=file_hash,
                    source_file=invoice_data.get('source_file') or json_filename,
                )
                if skip_deleted:
                    log(f"⏭️ Skipped deleted invoice ({skip_reason}): {invoice_number}")
                    return False
            except Exception as e:
                log(f"⚠️ Error checking deleted invoice guard: {e}")

        # Prepare payload - always include all fields, even if empty
        payload = {
            "invoice_number": invoice_number,
            "vendor": vendor,
            "total": total or '0',
            "office_location": office_location or '',
            "invoice_date": invoice_date or '',
            "clinic_id": office_location or '',
            "source_file": source_file,
            "json_path": json_file_path,
            "pdf_path": pdf_path or '',
        }
        
        # Log if we're using fallback values
        if not invoice_data.get('invoice_number') or not invoice_data.get('vendor'):
            log(f"📝 Using fallback values for {json_filename}: invoice_number={invoice_number}, vendor={vendor}")

        # Call ingest API
        try:
            if USE_REQUESTS:
                response = requests.post(INGEST_ENDPOINT, json=payload, timeout=10)
                if response.status_code in [200, 201]:
                    result = response.json()
                    if result.get('ok'):
                        if result.get('skipped'):
                            log(f"⏭️ Skipped (already exists): {invoice_number}")
                            return False
                        log(f"✅ Ingested: {invoice_number} ({vendor})")
                        return True
                    else:
                        log(f"⚠️ API returned ok=false: {invoice_number} - {result.get('message', 'Unknown error')}")
                        return False
                else:
                    log(f"⚠️ API error {response.status_code}: {invoice_number} - {response.text[:100]}")
                    return False
            else:
                # Use curl as fallback
                import tempfile
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                    json.dump(payload, f)
                    temp_file = f.name
                
                try:
                    curl_cmd = [
                        'curl', '-s', '-X', 'POST',
                        '-H', 'Content-Type: application/json',
                        '--data', f'@{temp_file}',
                        INGEST_ENDPOINT
                    ]
                    result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=10)
                    
                    if result.returncode == 0:
                        try:
                            response_data = json.loads(result.stdout)
                            if response_data.get('ok'):
                                if response_data.get('skipped'):
                                    log(f"⏭️ Skipped (already exists): {invoice_number}")
                                    return False
                                log(f"✅ Ingested: {invoice_number} ({vendor})")
                                return True
                            else:
                                log(f"⚠️ API returned ok=false: {invoice_number}")
                                return False
                        except json.JSONDecodeError:
                            log(f"⚠️ Invalid JSON response: {invoice_number}")
                            return False
                    else:
                        log(f"⚠️ curl error: {invoice_number} - {result.stderr[:100]}")
                        return False
                finally:
                    os.unlink(temp_file)
        except Exception as e:
            log(f"❌ Failed to call API: {e}")
            return False

    except Exception as e:
        log(f"❌ Error processing {json_file_path}: {e}")
        import traceback
        log(traceback.format_exc())
        return False

def main():
    """Main function"""
    log("=" * 80)
    log("🚀 Starting JSON File Ingestion")
    log("=" * 80)
    
    if not os.path.exists(OUTPUT_JSONS_PATH):
        log(f"❌ Output directory not found: {OUTPUT_JSONS_PATH}")
        return
    
    # Get all JSON files
    import glob
    json_files = glob.glob(os.path.join(OUTPUT_JSONS_PATH, "*.json"))
    log(f"📄 Found {len(json_files)} JSON files to process")
    
    if not json_files:
        log("⚠️ No JSON files found")
        return
    
    # Process files
    stats = {
        'total': len(json_files),
        'ingested': 0,
        'skipped': 0,
        'failed': 0,
    }
    
    log("\n" + "=" * 80)
    log("📥 Processing JSON files...")
    log("=" * 80)
    
    for idx, json_file in enumerate(json_files, 1):
        try:
            result = ingest_json_file(json_file)
            if result:
                stats['ingested'] += 1
            else:
                stats['skipped'] += 1
            
            # Progress indicator
            if idx % 50 == 0:
                log(f"[{idx}/{len(json_files)}] Processed {idx} files...")
            
            # Small delay to avoid overwhelming the API
            time.sleep(0.1)
        except Exception as e:
            stats['failed'] += 1
            log(f"❌ Error processing {json_file}: {e}")
    
    # Summary
    log("\n" + "=" * 80)
    log("📊 INGESTION SUMMARY")
    log("=" * 80)
    log(f"Total JSON files: {stats['total']}")
    log(f"✅ Successfully ingested: {stats['ingested']}")
    log(f"⏭️ Skipped (duplicates/deleted): {stats['skipped']}")
    log(f"❌ Failed: {stats['failed']}")
    log("=" * 80)
    log(f"\n🎉 Done! Check your dashboard - you should see {stats['ingested']} new invoices!")

if __name__ == "__main__":
    main()
