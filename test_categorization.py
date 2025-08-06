#!/usr/bin/env python3
"""
Test Categorization System
Demonstrates the hybrid categorization system with various vendor scenarios.
"""

from invoice_categorizer import categorize_invoice, HARDCODED_VENDOR_CATEGORIES

def test_vendor_scenarios():
    """Test various vendor scenarios to demonstrate the hybrid system."""
    print("🧪 Testing Hybrid Categorization System")
    print("=" * 60)
    
    # Test hard-coded vendors
    print("\n📋 Hard-coded Vendor Categories:")
    print("-" * 40)
    for vendor, expected_category in HARDCODED_VENDOR_CATEGORIES.items():
        category = categorize_invoice(vendor, [])
        status = "✅" if category == expected_category else "❌"
        print(f"{status} {vendor}: {category}")
    
    # Test unknown vendors with different line items
    print("\n📋 Unknown Vendors (Smart Detection):")
    print("-" * 40)
    
    # Dental Lab items
    lab_items = [
        {"product_name": "Porcelain Crown", "product_number": "CROWN-001", "line_item_total": "150.00"},
        {"product_name": "Lab Fee - CAD/CAM Milling", "product_number": "LAB-005", "line_item_total": "200.00"}
    ]
    category = categorize_invoice("New Lab Vendor", lab_items)
    print(f"✅ New Lab Vendor (crowns + lab fees): {category}")
    
    # Dental Supplies items
    supply_items = [
        {"product_name": "Composite Filling Material", "product_number": "COMP-002", "line_item_total": "25.00"},
        {"product_name": "Disposable Gloves", "product_number": "GLOVE-003", "line_item_total": "15.00"}
    ]
    category = categorize_invoice("New Supply Vendor", supply_items)
    print(f"✅ New Supply Vendor (materials + gloves): {category}")
    
    # Office Supplies items
    office_items = [
        {"product_name": "Office Paper", "product_number": "PAPER-004", "line_item_total": "10.00"},
        {"product_name": "Printer Ink", "product_number": "INK-001", "line_item_total": "45.00"}
    ]
    category = categorize_invoice("Office Supply Co", office_items)
    print(f"✅ Office Supply Co (paper + ink): {category}")
    
    # Mixed items (should prioritize by cost)
    mixed_items = [
        {"product_name": "Composite Filling Material", "product_number": "COMP-002", "line_item_total": "25.00"},
        {"product_name": "Porcelain Crown", "product_number": "CROWN-001", "line_item_total": "150.00"},
        {"product_name": "Office Paper", "product_number": "PAPER-004", "line_item_total": "10.00"}
    ]
    category = categorize_invoice("Mixed Vendor", mixed_items)
    print(f"✅ Mixed Vendor (supplies + crown + paper): {category}")
    
    # Unknown items
    unknown_items = [
        {"product_name": "Miscellaneous Item", "product_number": "MISC-001", "line_item_total": "50.00"}
    ]
    category = categorize_invoice("Unknown Vendor", unknown_items)
    print(f"✅ Unknown Vendor (miscellaneous): {category}")
    
    print("\n🎯 Summary:")
    print("-" * 40)
    print("• Hard-coded vendors get instant categorization")
    print("• Unknown vendors use smart line item detection")
    print("• Cost prioritization determines category for mixed items")
    print("• 'Other' category for unrecognized items")

if __name__ == "__main__":
    test_vendor_scenarios() 