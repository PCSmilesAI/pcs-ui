#!/usr/bin/env python3
"""
Add to Queue Script
Manually adds new JSON files to the invoice queue for testing.
"""

import os
import json
import glob
from datetime import datetime

def add_to_queue():
    """Add new JSON files to the invoice queue"""
    
    # Load existing queue
    queue_file = "invoice_queue.json"
    if os.path.exists(queue_file):
        with open(queue_file, 'r') as f:
            queue = json.load(f)
    else:
        queue = []
    
    # Find all email JSON files
    json_files = glob.glob("output_jsons/email_*.json")
    
    print(f"Found {len(json_files)} email JSON files")
    
    # Add first 5 files to queue as example
    for i, json_file in enumerate(json_files[:5]):
        filename = os.path.basename(json_file)
        
        # Create queue entry
        entry = {
            "id": f"email_{i+1}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "json_file": json_file,
            "pdf_file": f"email_invoices/{filename.replace('.json', '.pdf')}",
            "vendor": "epic",
            "status": "new",
            "timestamp": datetime.now().isoformat(),
            "assigned_to": None,
            "approved": False
        }
        
        queue.append(entry)
        print(f"Added: {filename}")
    
    # Save updated queue
    with open(queue_file, 'w') as f:
        json.dump(queue, f, indent=2)
    
    print(f"Queue updated with {len(queue)} total entries")

if __name__ == "__main__":
    add_to_queue() 