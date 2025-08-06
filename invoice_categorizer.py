#!/usr/bin/env python3
"""
Invoice Categorizer
Intelligently categorizes invoices based on line items with cost prioritization.
"""

import json
import os
import re
from collections import defaultdict
from typing import Dict, List, Tuple

# Category definitions with keywords and patterns
CATEGORY_KEYWORDS = {
    "Dental Lab": [
        # Lab-specific terms
        "lab", "laboratory", "crown", "bridge", "implant", "denture", "partial",
        "porcelain", "ceramic", "zirconia", "gold", "alloy", "casting", "milling",
        "cad/cam", "cad cam", "scan", "model", "wax", "try-in", "framework",
        "abutment", "coping", "veneer", "inlay", "onlay", "overlay", "jacket",
        "full crown", "3/4 crown", "temporary crown", "provisional",
        # Lab services
        "lab fee", "laboratory fee", "lab work", "laboratory work",
        "lab processing", "laboratory processing", "lab fabrication",
        "laboratory fabrication", "lab design", "laboratory design",
        # Specific lab products
        "crown and bridge", "fixed prosthetics", "removable prosthetics",
        "implant restoration", "dental restoration", "prosthetic work"
    ],
    "Dental Supplies": [
        # Dental materials
        "composite", "amalgam", "cement", "bonding", "adhesive", "sealant",
        "fluoride", "anesthetic", "lidocaine", "novocain", "numbing",
        "filling material", "restorative material", "dental material",
        # Instruments and tools
        "bur", "drill", "handpiece", "scaler", "curette", "explorer",
        "mirror", "probe", "forceps", "elevator", "retractor", "clamp",
        "matrix", "wedge", "band", "bracket", "wire", "elastic",
        # Consumables
        "glove", "mask", "gown", "bib", "cotton", "gauze", "sponge",
        "disposable", "sterile", "sterilization", "autoclave", "disinfectant",
        "cleaning solution", "lubricant", "oil", "paste", "gel", "cream",
        # Dental products
        "toothpaste", "mouthwash", "rinse", "floss", "brush", "polish",
        "whitening", "bleaching", "desensitizing", "fluoride treatment"
    ],
    "Cleaning Supplies": [
        # Cleaning products
        "cleaner", "cleaning", "disinfectant", "sanitizer", "sterilizer",
        "detergent", "soap", "degreaser", "solvent", "wipe", "towel",
        "mop", "broom", "vacuum", "filter", "air freshener", "deodorizer",
        # Janitorial supplies
        "paper towel", "toilet paper", "tissue", "trash bag", "garbage bag",
        "recycling", "waste", "biohazard", "sharps container", "disposal",
        # Surface cleaning
        "surface cleaner", "counter cleaner", "floor cleaner", "glass cleaner",
        "stainless steel cleaner", "equipment cleaner", "instrument cleaner"
    ],
    "Office Supplies": [
        # Paper and printing
        "paper", "printer", "ink", "toner", "cartridge", "copy", "print",
        "stationery", "envelope", "label", "sticker", "tape", "adhesive",
        "file", "folder", "binder", "clip", "staple", "pen", "pencil",
        "marker", "highlighter", "notepad", "calendar", "planner",
        # Office equipment
        "computer", "keyboard", "mouse", "monitor", "screen", "cable",
        "charger", "battery", "power supply", "adapter", "connector",
        # Furniture and fixtures
        "chair", "desk", "table", "cabinet", "shelf", "drawer", "lock",
        "key", "sign", "nameplate", "badge", "lanyard"
    ]
}

def normalize_text(text: str) -> str:
    """Normalize text for better matching."""
    if not text:
        return ""
    return re.sub(r'[^\w\s]', ' ', text.lower()).strip()

def calculate_category_score(item_text: str, item_cost: float) -> Dict[str, float]:
    """Calculate category scores for a line item based on keywords and cost."""
    normalized_text = normalize_text(item_text)
    scores = defaultdict(float)
    
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in normalized_text:
                # Base score for keyword match
                base_score = 1.0
                
                # Boost score for exact matches
                if keyword.lower() == normalized_text:
                    base_score = 3.0
                elif keyword.lower() in normalized_text.split():
                    base_score = 2.0
                
                # Weight by cost (more expensive items get higher scores)
                cost_multiplier = min(item_cost / 10.0, 5.0)  # Cap at 5x multiplier
                scores[category] += base_score * cost_multiplier
    
    return dict(scores)

def categorize_line_items(line_items: List[Dict]) -> str:
    """Categorize an invoice based on its line items with cost prioritization."""
    if not line_items:
        return "Other"
    
    category_totals = defaultdict(float)
    category_scores = defaultdict(float)
    
    for item in line_items:
        product_name = item.get('product_name', '')
        product_number = item.get('product_number', '')
        line_total = float(item.get('line_item_total', 0))
        
        # Combine product name and number for analysis
        item_text = f"{product_name} {product_number}".strip()
        
        # Calculate category scores for this item
        item_scores = calculate_category_score(item_text, line_total)
        
        # Add to category totals and scores
        for category, score in item_scores.items():
            category_scores[category] += score
            category_totals[category] += line_total
    
    # If no categories matched, return "Other"
    if not category_scores:
        return "Other"
    
    # Prioritize by total cost first, then by keyword scores
    best_category = max(category_totals.items(), key=lambda x: (x[1], category_scores.get(x[0], 0)))
    
    return best_category[0]

def update_invoice_categories():
    """Update all invoices in the queue with proper categories."""
    queue_file = "invoice_queue.json"
    
    if not os.path.exists(queue_file):
        print("❌ invoice_queue.json not found")
        return
    
    # Load current queue
    with open(queue_file, 'r') as f:
        queue = json.load(f)
    
    print(f"📋 Processing {len(queue)} invoices for categorization...")
    
    updated_count = 0
    for invoice in queue:
        json_path = invoice.get('json_path', '')
        if not json_path or not os.path.exists(json_path):
            continue
        
        try:
            # Load the detailed invoice data
            with open(json_path, 'r') as f:
                invoice_data = json.load(f)
            
            # Get line items
            line_items = invoice_data.get('line_items', [])
            
            # Categorize based on line items
            category = categorize_line_items(line_items)
            
            # Update the category in the queue
            old_category = invoice.get('category', 'Unknown')
            invoice['category'] = category
            
            if old_category != category:
                print(f"🔄 {invoice.get('invoice_number', 'Unknown')}: {old_category} → {category}")
                updated_count += 1
            else:
                print(f"✅ {invoice.get('invoice_number', 'Unknown')}: {category}")
                
        except Exception as e:
            print(f"❌ Error processing {invoice.get('invoice_number', 'Unknown')}: {e}")
            invoice['category'] = "Other"
    
    # Save updated queue
    with open(queue_file, 'w') as f:
        json.dump(queue, f, indent=2)
    
    print(f"\n🎯 Categorization complete!")
    print(f"✅ Updated {updated_count} invoices")
    print(f"📊 Total invoices processed: {len(queue)}")

def test_categorization():
    """Test the categorization logic with sample data."""
    test_items = [
        {"product_name": "Porcelain Crown", "product_number": "CROWN-001", "line_item_total": "150.00"},
        {"product_name": "Composite Filling Material", "product_number": "COMP-002", "line_item_total": "25.00"},
        {"product_name": "Disposable Gloves", "product_number": "GLOVE-003", "line_item_total": "15.00"},
        {"product_name": "Office Paper", "product_number": "PAPER-004", "line_item_total": "10.00"},
        {"product_name": "Lab Fee - CAD/CAM Milling", "product_number": "LAB-005", "line_item_total": "200.00"},
    ]
    
    print("🧪 Testing categorization logic...")
    category = categorize_line_items(test_items)
    print(f"📊 Test result: {category}")
    
    # Show individual item analysis
    print("\n📋 Individual item analysis:")
    for item in test_items:
        item_text = f"{item['product_name']} {item['product_number']}"
        scores = calculate_category_score(item_text, float(item['line_item_total']))
        print(f"  {item_text}: {scores}")

if __name__ == "__main__":
    print("🎯 Invoice Categorizer")
    print("=" * 50)
    
    # Test the logic first
    test_categorization()
    
    print("\n" + "=" * 50)
    
    # Update all invoices
    update_invoice_categories() 