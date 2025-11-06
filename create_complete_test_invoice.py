#!/usr/bin/env python3
"""
Create a complete test invoice with all required fields for workflow testing.
"""

import json
import os
from datetime import datetime, timedelta

# PCS offices to choose from
PCS_OFFICES = [
    "Pacific Crest Smiles - Eugene",
    "Pacific Crest Smiles - Portland",
    "Pacific Crest Smiles - Salem",
    "Pacific Crest Smiles - Bend",
    "Pacific Crest Smiles - Medford",
]

def create_test_invoice():
    """Create a complete test invoice with all required fields."""
    
    today = datetime.now()
    due_date = today + timedelta(days=30)
    
    invoice = {
        "id": "TEST-COMPLETE-WORKFLOW-001",
        "invoice_number": "TEST-COMPLETE-001",
        "invoice": "TEST-COMPLETE-001",
        "vendor": "Test Dental Supplies Inc",
        "vendor_name": "Test Dental Supplies Inc",
        "invoice_date": today.strftime("%m/%d/%Y"),
        "due_date": due_date.strftime("%m/%d/%Y"),
        "invoice_total": 2500.00,  # Numeric, not string
        "total": 2500.00,  # Backup field
        "amount": 2500.00,  # Another backup field
        "office": PCS_OFFICES[0],  # Primary office field
        "office_location": PCS_OFFICES[0],  # Backup office field
        "clinic_id": PCS_OFFICES[0],  # Another backup
        "category": "Dental Lab",
        "status": "incoming",  # Start from incoming so we can test full workflow
        "approved": False,
        "approvals": {},
        "line_items": [
            {
                "product_number": "DL-2025-001",
                "product_name": "Crown - Molar",
                "Quantity": 5,
                "unit_price": 250.00,
                "line_item_total": 1250.00
            },
            {
                "product_number": "DL-2025-002",
                "product_name": "Bridge - 3 Unit",
                "Quantity": 2,
                "unit_price": 625.00,
                "line_item_total": 1250.00
            }
        ],
        "source_file": "test_complete_workflow.json",
        "json_path": "/output_jsons/test_complete_workflow.json",
        "pdf_path": "/email_invoices/test_complete_workflow.pdf",
        "timestamp": today.isoformat(),
    }
    
    return invoice

def main():
    """Add the test invoice to the queue."""
    
    # Path to invoice queue
    queue_path = os.path.join(os.path.dirname(__file__), "pcs_ai_data", "invoice_queue.json")
    
    # Load existing queue
    try:
        with open(queue_path, 'r') as f:
            queue = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        queue = []
    
    # Ensure it's a list
    if isinstance(queue, dict) and "invoices" in queue:
        queue = queue["invoices"]
    elif not isinstance(queue, list):
        queue = []
    
    # Create and add the test invoice
    test_invoice = create_test_invoice()
    
    # Remove any existing test invoices with the same ID
    queue = [inv for inv in queue if inv.get("id") != test_invoice["id"]]
    
    # Add the new test invoice at the beginning
    queue.insert(0, test_invoice)
    
    # Save back to file
    with open(queue_path, 'w') as f:
        json.dump(queue, f, indent=2)
    
    print(f"✅ Test invoice created successfully!")
    print(f"   ID: {test_invoice['id']}")
    print(f"   Invoice Number: {test_invoice['invoice_number']}")
    print(f"   Amount: ${test_invoice['invoice_total']:.2f}")
    print(f"   Office: {test_invoice['office']}")
    print(f"   Status: {test_invoice['status']}")
    print(f"   Queue path: {queue_path}")
    print(f"   Total invoices in queue: {len(queue)}")

if __name__ == "__main__":
    main()

