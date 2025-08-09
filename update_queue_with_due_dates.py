#!/usr/bin/env python3
"""
Update Invoice Queue with Due Dates Script
This script reads the existing invoice queue and updates each entry with the due_date
field from the corresponding parsed invoice JSON file.
"""

import os
import json
from datetime import datetime

def load_json_file(file_path):
    """Load and parse a JSON file"""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading {file_path}: {e}")
        return None

def update_queue_with_due_dates():
    """Update the invoice queue with due dates from parsed invoice files"""
    
    # Load current invoice queue
    queue_file = "invoice_queue.json"
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    with open(queue_file, 'r') as f:
        current_queue = json.load(f)
    
    print(f"📋 Found {len(current_queue)} entries in current queue")
    
    # Track updates
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    # Process each queue entry
    for i, entry in enumerate(current_queue):
        json_path = entry.get('json_path', '')
        
        if not json_path:
            print(f"⚠️ Entry {i+1}: No json_path, skipping")
            skipped_count += 1
            continue
        
        # Check if the JSON file exists
        if not os.path.exists(json_path):
            print(f"⚠️ Entry {i+1}: JSON file not found: {json_path}")
            skipped_count += 1
            continue
        
        # Load the parsed invoice data
        invoice_data = load_json_file(json_path)
        if not invoice_data:
            print(f"❌ Entry {i+1}: Failed to load invoice data from {json_path}")
            error_count += 1
            continue
        
        # Extract due date
        due_date = invoice_data.get('due_date', '')
        
        if due_date:
            # Update the queue entry with the due date
            entry['due_date'] = due_date
            updated_count += 1
            
            print(f"✅ Entry {i+1}: Updated {entry.get('invoice_number', 'Unknown')} with due date: {due_date}")
        else:
            print(f"⚠️ Entry {i+1}: No due date found in {entry.get('invoice_number', 'Unknown')}")
            skipped_count += 1
    
    # Save the updated queue
    with open(queue_file, 'w') as f:
        json.dump(current_queue, f, indent=2)
    
    print("=" * 50)
    print(f"📊 UPDATE COMPLETE")
    print(f"✅ Updated entries: {updated_count}")
    print(f"⚠️ Skipped entries: {skipped_count}")
    print(f"❌ Error entries: {error_count}")
    print(f"📋 Total entries: {len(current_queue)}")
    print("=" * 50)
    
    # Show sample of updated entries
    if updated_count > 0:
        print("\n📄 Sample updated entries:")
        for i, entry in enumerate(current_queue[:5]):  # Show first 5
            if entry.get('due_date'):
                print(f"  {entry.get('invoice_number', 'Unknown')}: {entry.get('due_date')} (was: {entry.get('invoice_date', 'Unknown')})")

if __name__ == "__main__":
    update_queue_with_due_dates()
