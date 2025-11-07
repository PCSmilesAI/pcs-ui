#!/usr/bin/env python3
"""
Full Inbox Scan Script
======================

This script performs a one-time FULL scan of the entire inbox to extract
any invoices that may have been missed due to email format variations.

Usage:
    python3 run_full_inbox_scan.py

This will:
1. Scan ALL emails in the inbox (not just unread)
2. Extract PDFs from all emails (including those with non-standard formats)
3. Process all extracted PDFs in parallel
4. Log all results with detailed statistics

After this completes, the system will revert to scanning only UNREAD emails.
"""

import sys
import os
import time
from datetime import datetime

# Add the script directory to path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from email_ingestion_agent_enhanced import check_inbox, _last_scan_result, log

def main():
    print("\n" + "="*80)
    print("FULL INBOX SCAN - ONE TIME ANALYSIS")
    print("="*80)
    print(f"Started at: {datetime.now().isoformat()}")
    print("This will scan ALL emails in the inbox and extract any missed invoices")
    print("="*80 + "\n")
    
    start_time = time.time()
    
    try:
        # Run full scan
        log("[FULL_SCAN] Starting one-time full inbox analysis")
        check_inbox(full_scan=True)
        
        # Print results
        duration = time.time() - start_time
        print("\n" + "="*80)
        print("FULL INBOX SCAN COMPLETED")
        print("="*80)
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print("\nResults:")
        print(f"  Added: {_last_scan_result.get('added', 0)} invoices")
        print(f"  Skipped: {_last_scan_result.get('skipped', 0)} emails")
        print(f"  Duration: {_last_scan_result.get('duration_ms', 0)}ms")
        if _last_scan_result.get('error'):
            print(f"  Error: {_last_scan_result.get('error')}")
        print("="*80 + "\n")
        
        return 0
        
    except Exception as e:
        print(f"\n[ERROR] Full scan failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())

