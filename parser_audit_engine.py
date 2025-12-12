#!/usr/bin/env python3
"""
Parser Audit Engine

Scans the email_invoices folder, extracts text from all PDFs, identifies vendors,
and reports which vendors have parsers vs which need new ones.

Outputs:
- vendor_audit_report.json: Full audit with all PDFs grouped by vendor
- Console report showing parser gaps
"""

import os
import sys
import json
import re
from collections import defaultdict
from pathlib import Path
from datetime import datetime

# Use PCS_DATA_DIR if set, otherwise use relative path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
EMAIL_INVOICES_DIR = os.path.join(BASE_DIR, 'email_invoices')
OUTPUT_DIR = os.path.join(DATA_DIR, 'output_jsons')

# Known vendor parsers
KNOWN_PARSERS = {
    'epic': 'epic_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'henry': 'henry_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py',
    'general': 'general_invoice_parser.py'
}

# Vendor detection patterns (vendor_key -> list of patterns to match)
VENDOR_PATTERNS = {
    'henry': [
        r'henry\s*schein',
        r'henryschein',
        r'HENRY SCHEIN',
    ],
    'patterson': [
        r'patterson\s*dental',
        r'patterson companies',
        r'PATTERSON',
    ],
    'epic': [
        r'epic\s*dental',
        r'epic dental lab',
        r'EPIC DENTAL',
    ],
    'tc': [
        r't\.?c\.?\s*dental',
        r'tc dental',
        r'T\.C\. DENTAL',
    ],
    'artisan': [
        r'artisan\s*dental',
        r'artisan dental lab',
        r'ARTISAN',
    ],
    'exodus': [
        r'exodus',
        r'EXODUS',
    ],
    'darby': [
        r'darby\s*dental',
        r'darby dental supply',
        r'DARBY',
        r'Darby_Invoice',
    ],
    'dandy': [
        r'dandy',
        r'DANDY',
        r'meetdandy',
    ],
    'brasseler': [
        r'brasseler',
        r'BRASSELER',
    ],
    'ctr_services': [
        r'ctr\s*services',
        r'CTR Services',
    ],
    'a1_professional': [
        r'a-?1\s*professional',
        r'A-1 Professional',
        r'aoneprofessional',
    ],
    'comcast': [
        r'comcast',
        r'COMCAST',
    ],
    'bridgeford': [
        r'bridgeford',
        r'BFV',
    ],
}


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using multiple strategies"""
    text = ""
    
    # Try PyMuPDF (fitz) first
    try:
        import fitz
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text('text')
        doc.close()
        if text.strip():
            return text
    except Exception as e:
        pass
    
    # Try pdfminer as fallback
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract
        text = pdfminer_extract(pdf_path) or ''
        if text.strip():
            return text
    except Exception:
        pass
    
    # OCR fallback for scanned documents
    try:
        import fitz
        import pytesseract
        from PIL import Image
        
        doc = fitz.open(pdf_path)
        texts = []
        for i, page in enumerate(doc):
            if i >= 2:  # Only OCR first 2 pages
                break
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            texts.append(pytesseract.image_to_string(img))
        doc.close()
        return '\n'.join(texts)
    except Exception:
        pass
    
    return text


def detect_vendor_from_text(text: str, filename: str) -> tuple:
    """
    Detect vendor from PDF text content and filename.
    Returns (vendor_key, confidence_score, matched_pattern)
    """
    combined = f"{text} {filename}".lower()
    
    best_match = None
    best_confidence = 0
    best_pattern = None
    
    for vendor, patterns in VENDOR_PATTERNS.items():
        for pattern in patterns:
            matches = re.findall(pattern, combined, re.IGNORECASE)
            if matches:
                # More matches = higher confidence
                confidence = min(1.0, len(matches) * 0.3 + 0.4)
                
                # Boost confidence if in filename
                if re.search(pattern, filename, re.IGNORECASE):
                    confidence = min(1.0, confidence + 0.3)
                
                if confidence > best_confidence:
                    best_confidence = confidence
                    best_match = vendor
                    best_pattern = pattern
    
    return best_match, best_confidence, best_pattern


def detect_vendor_from_filename(filename: str) -> str:
    """Quick vendor detection from filename only"""
    filename_lower = filename.lower()
    
    patterns = {
        'darby': ['darby'],
        'dandy': ['dandy'],
        'henry': ['henry', 'henryschein'],
        'patterson': ['patterson'],
        'epic': ['epic'],
        'tc': ['tc_dental', 't.c.'],
        'artisan': ['artisan'],
        'exodus': ['exodus'],
        'brasseler': ['brasseler'],
        'ctr_services': ['ctr'],
        'a1_professional': ['a-1', 'aoneprofessional', 'a1_professional'],
        'comcast': ['comcast'],
        'bridgeford': ['bridgeford', 'bfv'],
    }
    
    for vendor, keywords in patterns.items():
        for kw in keywords:
            if kw in filename_lower:
                return vendor
    
    return None


def scan_email_invoices():
    """Scan all PDFs in email_invoices folder"""
    
    if not os.path.exists(EMAIL_INVOICES_DIR):
        print(f"❌ Email invoices directory not found: {EMAIL_INVOICES_DIR}")
        return {}
    
    pdf_files = [f for f in os.listdir(EMAIL_INVOICES_DIR) if f.lower().endswith('.pdf')]
    print(f"📂 Found {len(pdf_files)} PDF files in email_invoices/")
    
    vendor_groups = defaultdict(list)
    unknown_pdfs = []
    
    for i, filename in enumerate(pdf_files):
        filepath = os.path.join(EMAIL_INVOICES_DIR, filename)
        
        # Quick detection from filename first
        vendor = detect_vendor_from_filename(filename)
        confidence = 0.8 if vendor else 0
        
        # If no quick match, extract text and analyze
        if not vendor:
            try:
                text = extract_text_from_pdf(filepath)
                vendor, confidence, pattern = detect_vendor_from_text(text, filename)
            except Exception as e:
                print(f"  ⚠️ Error processing {filename}: {e}")
                vendor = None
                confidence = 0
        
        if vendor and confidence >= 0.5:
            vendor_groups[vendor].append({
                'filename': filename,
                'filepath': filepath,
                'confidence': confidence,
            })
        else:
            unknown_pdfs.append({
                'filename': filename,
                'filepath': filepath,
                'confidence': confidence,
                'detected_vendor': vendor,
            })
        
        # Progress indicator
        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(pdf_files)} files...")
    
    return vendor_groups, unknown_pdfs


def generate_report(vendor_groups: dict, unknown_pdfs: list):
    """Generate audit report"""
    
    report = {
        'generated_at': datetime.now().isoformat(),
        'total_pdfs': sum(len(files) for files in vendor_groups.values()) + len(unknown_pdfs),
        'vendors_with_parsers': [],
        'vendors_needing_parsers': [],
        'unknown_pdfs': [],
        'vendor_details': {},
    }
    
    print("\n" + "="*60)
    print("VENDOR AUDIT REPORT")
    print("="*60)
    
    # Categorize vendors
    for vendor, files in sorted(vendor_groups.items(), key=lambda x: -len(x[1])):
        has_parser = vendor in KNOWN_PARSERS
        parser_name = KNOWN_PARSERS.get(vendor, f"{vendor}_parser.py (NEEDED)")
        
        vendor_info = {
            'vendor': vendor,
            'file_count': len(files),
            'has_parser': has_parser,
            'parser_name': parser_name,
            'sample_files': [f['filename'] for f in files[:5]],
        }
        
        report['vendor_details'][vendor] = vendor_info
        
        if has_parser:
            report['vendors_with_parsers'].append(vendor)
            status = "✅"
        else:
            report['vendors_needing_parsers'].append(vendor)
            status = "❌ NEEDS PARSER"
        
        print(f"\n{status} {vendor.upper()}")
        print(f"   Files: {len(files)}")
        print(f"   Parser: {parser_name}")
        if not has_parser:
            print(f"   Sample files:")
            for f in files[:3]:
                print(f"      - {f['filename']}")
    
    # Unknown PDFs
    if unknown_pdfs:
        print(f"\n❓ UNKNOWN VENDOR ({len(unknown_pdfs)} files)")
        report['unknown_pdfs'] = [u['filename'] for u in unknown_pdfs[:20]]
        for u in unknown_pdfs[:5]:
            print(f"   - {u['filename']}")
        if len(unknown_pdfs) > 5:
            print(f"   ... and {len(unknown_pdfs) - 5} more")
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total PDFs: {report['total_pdfs']}")
    print(f"Vendors with parsers: {len(report['vendors_with_parsers'])}")
    print(f"Vendors needing parsers: {len(report['vendors_needing_parsers'])}")
    print(f"Unknown PDFs: {len(unknown_pdfs)}")
    
    if report['vendors_needing_parsers']:
        print("\n🔧 PARSERS TO CREATE:")
        for vendor in report['vendors_needing_parsers']:
            count = report['vendor_details'][vendor]['file_count']
            print(f"   - {vendor}_parser.py ({count} files)")
    
    return report


def main():
    print("🔍 Parser Audit Engine")
    print("Scanning email_invoices folder...\n")
    
    vendor_groups, unknown_pdfs = scan_email_invoices()
    report = generate_report(vendor_groups, unknown_pdfs)
    
    # Save report
    report_path = os.path.join(BASE_DIR, 'vendor_audit_report.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n📄 Report saved to: {report_path}")
    
    return report


if __name__ == '__main__':
    main()

