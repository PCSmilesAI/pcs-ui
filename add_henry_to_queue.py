#!/usr/bin/env python3
"""
Add Henry Schein to Queue Script
Adds new Henry Schein JSON files to the invoice queue.
"""

import os
import json
import glob
from datetime import datetime

def add_henry_to_queue():
    """Add new Henry Schein JSON files to the invoice queue"""
    
    # Load existing queue
    queue_file = "invoice_queue.json"
    if os.path.exists(queue_file):
        with open(queue_file, 'r') as f:
            queue = json.load(f)
    else:
        queue = []
    
    # Find all Henry Schein JSON files (new ones without _parsed suffix)
    json_files = glob.glob("output_jsons/email_*.json")
    
    print(f"Found {len(json_files)} email JSON files")
    
    # Add first 10 Henry files to queue
    added_count = 0
    for i, json_file in enumerate(json_files[:10]):
        filename = os.path.basename(json_file)
        
        # Skip files that were already processed
        if any(entry.get('json_file') == json_file for entry in queue):
            continue
        
        # Create queue entry
        entry = {
            "id": f"henry_{i+1}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "json_file": json_file,
            "pdf_file": f"email_invoices/{filename.replace('.json', '.pdf')}",
            "vendor": "henry",
            "status": "new",
            "timestamp": datetime.now().isoformat(),
            "assigned_to": None,
            "approved": False
        }
        
        queue.append(entry)
        added_count += 1
        print(f"Added: {filename}")
    
    # Save updated queue
    with open(queue_file, 'w') as f:
        json.dump(queue, f, indent=2)
    
    print(f"Queue updated with {len(queue)} total entries ({added_count} new)")

if __name__ == "__main__":
    add_henry_to_queue() 