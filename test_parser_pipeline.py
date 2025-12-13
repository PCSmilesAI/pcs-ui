#!/usr/bin/env python3
"""
Test Parser Pipeline

Tests the invoice parsing pipeline with sample invoices from each vendor
to verify the routing and parsing is working correctly.
"""

import os
import sys
import subprocess
import json
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EMAIL_INVOICES_DIR = os.path.join(BASE_DIR, 'email_invoices')

# Test samples for each vendor
TEST_SAMPLES = {
    'darby': 'Darby_Invoice_5571812.pdf',
    'dandy': 'Dandy_12e65786.pdf',
    'brasseler': 'Brasseler-6394387_7e223fdf.pdf',
    'ctr_services': 'CTR Services Northwest November 2025 Statement_7685be7c.pdf',
    'a1_professional': 'A-1_Professional_Exterminating_25759_invoice_pdf_3ea8517c.pdf',
}


def test_vendor_detector(pdf_path: str) -> dict:
    """Test vendor detection"""
    try:
        result = subprocess.run(
            ['python3', 'vendor_detector.py', pdf_path],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=BASE_DIR
        )
        
        # Parse JSON output from the last line
        lines = result.stdout.strip().split('\n')
        for line in reversed(lines):
            if line.startswith('{'):
                return json.loads(line + '\n'.join(lines[lines.index(line)+1:]))
        return {'error': 'No JSON output'}
    except Exception as e:
        return {'error': str(e)}


def test_vendor_router(pdf_path: str) -> dict:
    """Test vendor routing"""
    try:
        result = subprocess.run(
            ['python3', 'vendor_router.py', pdf_path],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=BASE_DIR
        )
        
        return {
            'vendor': result.stdout.strip(),
            'success': result.returncode == 0,
            'stderr': result.stderr[:500] if result.stderr else ''
        }
    except Exception as e:
        return {'error': str(e)}


def test_direct_parser(vendor: str, pdf_path: str) -> dict:
    """Test direct parser execution"""
    parser_map = {
        'darby': 'darby_parser.py',
        'dandy': 'dandy_parser.py',
        'brasseler': 'brasseler_parser.py',
        'ctr_services': 'ctr_services_parser.py',
        'a1_professional': 'a1_professional_parser.py',
        'henry': 'henry_parser.py',
        'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
        'epic': 'epic_parser.py',
        'general': 'general_invoice_parser.py',
    }
    
    parser = parser_map.get(vendor)
    if not parser:
        return {'error': f'No parser for vendor: {vendor}'}
    
    try:
        result = subprocess.run(
            ['python3', parser, pdf_path],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=BASE_DIR
        )
        
        return {
            'success': result.returncode == 0,
            'has_output': 'invoice parsed' in result.stdout.lower() or 'invoice_number' in result.stdout,
            'stdout_preview': result.stdout[:500] if result.stdout else '',
            'stderr_preview': result.stderr[:200] if result.stderr else ''
        }
    except Exception as e:
        return {'error': str(e)}


def run_tests():
    """Run all parser tests"""
    print("=" * 70)
    print("PARSER PIPELINE TEST")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 70)
    
    results = {}
    
    for vendor, filename in TEST_SAMPLES.items():
        pdf_path = os.path.join(EMAIL_INVOICES_DIR, filename)
        
        if not os.path.exists(pdf_path):
            print(f"\n⚠️ Sample not found: {filename}")
            results[vendor] = {'status': 'SKIPPED', 'reason': 'file not found'}
            continue
        
        print(f"\n{'='*50}")
        print(f"Testing: {vendor.upper()}")
        print(f"File: {filename}")
        print("-" * 50)
        
        # Test 1: Vendor Detection
        print("\n1️⃣ Vendor Detection:")
        detection = test_vendor_detector(pdf_path)
        if 'error' not in detection:
            detected = detection.get('vendor', 'unknown')
            confidence = detection.get('confidence', 0)
            print(f"   Detected: {detected} (confidence: {confidence:.0%})")
            detection_pass = detected == vendor or vendor in detected.lower()
        else:
            print(f"   ❌ Error: {detection['error']}")
            detection_pass = False
        
        # Test 2: Direct Parser
        print("\n2️⃣ Direct Parser:")
        parser_result = test_direct_parser(vendor, pdf_path)
        if 'error' not in parser_result:
            if parser_result['success'] and parser_result['has_output']:
                print(f"   ✅ Parser executed successfully")
                parser_pass = True
            else:
                print(f"   ⚠️ Parser ran but output unclear")
                parser_pass = parser_result['success']
        else:
            print(f"   ❌ Error: {parser_result['error']}")
            parser_pass = False
        
        # Test 3: Full Router Pipeline
        print("\n3️⃣ Router Pipeline:")
        router_result = test_vendor_router(pdf_path)
        if 'error' not in router_result:
            routed_vendor = router_result.get('vendor', '')
            if router_result['success']:
                print(f"   ✅ Routed to: {routed_vendor}")
                router_pass = True
            else:
                print(f"   ❌ Router failed")
                router_pass = False
        else:
            print(f"   ❌ Error: {router_result['error']}")
            router_pass = False
        
        # Summary for this vendor
        overall_pass = detection_pass and parser_pass and router_pass
        results[vendor] = {
            'status': 'PASS' if overall_pass else 'FAIL',
            'detection': 'PASS' if detection_pass else 'FAIL',
            'parser': 'PASS' if parser_pass else 'FAIL',
            'router': 'PASS' if router_pass else 'FAIL',
        }
        
        status_emoji = "✅" if overall_pass else "❌"
        print(f"\n{status_emoji} {vendor.upper()}: {'PASS' if overall_pass else 'FAIL'}")
    
    # Final Summary
    print("\n" + "=" * 70)
    print("FINAL SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for r in results.values() if r.get('status') == 'PASS')
    failed = sum(1 for r in results.values() if r.get('status') == 'FAIL')
    skipped = sum(1 for r in results.values() if r.get('status') == 'SKIPPED')
    
    print(f"\n✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⏭️ Skipped: {skipped}")
    
    print("\nDetails:")
    for vendor, result in results.items():
        status = result.get('status', 'UNKNOWN')
        if status == 'PASS':
            print(f"  ✅ {vendor}")
        elif status == 'FAIL':
            print(f"  ❌ {vendor}: detection={result.get('detection')}, parser={result.get('parser')}, router={result.get('router')}")
        else:
            print(f"  ⏭️ {vendor}: {result.get('reason', 'unknown')}")
    
    print("\n" + "=" * 70)
    print(f"Completed at: {datetime.now().isoformat()}")
    print("=" * 70)
    
    return results


if __name__ == '__main__':
    run_tests()



