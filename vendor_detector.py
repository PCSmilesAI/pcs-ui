#!/usr/bin/env python3
"""
Vendor Detector - Confidence-based vendor detection for invoice PDFs

This module provides a smart vendor detection system that:
1. Extracts text from PDFs (digital or OCR)
2. Matches against known vendor patterns
3. Returns vendor with confidence score
4. Only routes to vendor parser if confidence > threshold
"""

import os
import re
from dataclasses import dataclass
from typing import Optional, List, Tuple

# Vendor patterns with weighted keywords
# Format: vendor_key -> list of (pattern, weight) tuples
# Higher weight = stronger indicator
VENDOR_PATTERNS = {
    'henry': [
        (r'henry\s*schein', 1.0),
        (r'henryschein', 1.0),
        (r'Ship/Sold-To:', 0.3),  # Henry-specific format
        (r'Invoice Total', 0.2),
        (r'\d{3}-\d{4}', 0.1),  # Product number format
    ],
    'patterson': [
        (r'patterson', 1.0),
        (r'patterson\s*dental', 1.0),
        (r'patterson companies', 0.8),
    ],
    'epic': [
        (r'epic\s*dental', 1.0),
        (r'epic dental lab', 1.0),
        (r'epicdentallab', 0.9),
    ],
    'tc': [
        (r't\.?c\.?\s*dental', 1.0),
        (r'tc dental lab', 1.0),
    ],
    'artisan': [
        (r'artisan\s*dental', 1.0),
        (r'artisan dental lab', 1.0),
    ],
    'exodus': [
        (r'exodus', 0.9),
        (r'exodus dental', 1.0),
    ],
    'darby': [
        (r'darby\s*dental', 1.0),
        (r'darbydental\.com', 1.0),
        (r'darby dental supply', 1.0),
        (r'Darby_Invoice', 0.9),
    ],
    'dandy': [
        (r'dandy', 0.7),
        (r'meetdandy', 1.0),
        (r'zima international', 0.8),  # Dandy's parent company
        (r'Powered by Dandy', 1.0),
    ],
    'brasseler': [
        (r'brasseler', 1.0),
        (r'brasseler\s*usa', 1.0),
    ],
    'ctr_services': [
        (r'ctr\s*services', 1.0),
        (r'campbell\s*commercial', 0.9),
        (r'campbellre\.com', 1.0),
        (r'campbellcre\.appfolio', 0.9),
    ],
    'a1_professional': [
        (r'a-?1\s*professional', 1.0),
        (r'aoneprofessional', 1.0),
        (r'A-1 Professional Exterminating', 1.0),
        # Also matches A-1 Fire Protection / Umpqua Valley Fire Services
        (r'a-?1\s*fire', 1.0),
        (r'umpqua\s*valley\s*fire', 1.0),
    ],
    'comcast': [
        (r'comcast', 1.0),
        (r'comcast\s*business', 1.0),
        (r'xfinity', 0.7),
    ],
    'bridgeford': [
        (r'bridgeford', 1.0),
        (r'BFV Invoice', 1.0),
    ],
    # NEW: Additional vendors identified during reprocessing
    'waterco': [
        (r'waterco', 1.0),
        (r'water\s*co', 0.9),
        (r'WaterCo_Smiles', 1.0),
    ],
    'dental_medical_staffing': [
        (r'dental\s*medical\s*staffing', 1.0),
        (r'dms\s*inc', 0.8),
        (r'Dental_Medical_Staffing_Inc', 1.0),
    ],
    'crest_oralb': [
        (r'crest.*oral-?b', 1.0),
        (r'p&g\s*professional', 0.9),
        (r'pgpro\.com', 1.0),
        (r'Crest & Oral-B Professional', 1.0),
    ],
    'physicians_resource': [
        (r"physician'?s?\s*resource", 1.0),
        (r'Physician\'s Resource', 1.0),
    ],
    'trustworkz': [
        (r'trustworkz', 1.0),
        (r'TRUSTWORKZ_INC', 1.0),
    ],
    'medpro': [
        (r'med\s*pro', 1.0),
        (r'Med Pro Inv', 1.0),
    ],
    'columbia_smiles': [
        (r'columbia\s*smiles', 1.0),
        (r'ColumbiaSmiles', 1.0),
    ],
    # NEW: Vendors identified from Unknown invoice review
    'linde_gas': [
        (r'linde\s*gas', 1.0),
        (r'linde\s*plc', 0.9),
        (r'linde gas & equipment', 1.0),
    ],
    'kettenbach': [
        (r'kettenbach', 1.0),
        (r'kettenbach\s*lp', 1.0),
    ],
    'republic_services': [
        (r'republic\s*services', 1.0),
        (r'albany.*sanitation', 0.9),
        (r'republic services #', 1.0),
    ],
    'clipboard_health': [
        (r'clipboard\s*health', 1.0),
        (r'clipboardhealth\.com', 1.0),
    ],
    'oral_biotech': [
        (r'oral\s*biotech', 1.0),
        (r'carifree', 1.0),
        (r'carifree\.com', 1.0),
    ],
    'oregon_linen': [
        (r'oregon\s*linen', 1.0),
        (r'oregonlinen\.com', 1.0),
    ],
    'cintas': [
        (r'cintas', 1.0),
        (r'cintas\s*corporation', 1.0),
    ],
    'trilogy_medwaste': [
        (r'trilogy\s*medwaste', 1.0),
        (r'trilogymedwaste\.com', 1.0),
    ],
    'glidewell': [
        (r'glidewell', 1.0),
        (r'bruxzir', 0.9),
        (r'glidewell\s*dental', 1.0),
    ],
    'do_good_cleaning': [
        (r'do\s*good\s*clean', 1.0),
        (r'dogoodcleans\.com', 1.0),
    ],
    'airgas': [
        (r'airgas', 1.0),
        (r'airgas\s*usa', 1.0),
        (r'airgas\.com', 0.9),
    ],
    'shred_it': [
        (r'shred-?it', 1.0),
        (r'stericycle', 0.8),  # Shred-it parent company
    ],
    'pacific_office': [
        (r'pacific\s*office\s*automation', 1.0),
        (r'pacificoffice\.com', 1.0),
    ],
    'ultradent': [
        (r'ultradent', 1.0),
        (r'ultradent\s*products', 1.0),
    ],
    'safeway': [
        (r'safeway', 1.0),
    ],
    # Final review vendors
    'crystal_falls': [
        (r'crystal\s*falls', 1.0),
        (r'crystalfalls', 1.0),
    ],
    'megagen': [
        (r'megagen', 1.0),
        (r'xpeed', 0.9),
        (r'anyridge', 0.9),
    ],
    'method_procurement': [
        (r'method\s*procurement', 1.0),
        (r'methodprocure', 1.0),
    ],
    'iron_mountain': [
        (r'iron\s*mountain', 1.0),
    ],
    'fyle': [
        (r'fyle', 1.0),
        (r'fylehq', 1.0),
    ],
    'usps': [
        (r'usps', 1.0),
        (r'postal\s*service', 0.8),
    ],
    'fedex': [
        (r'fedex', 1.0),
    ],
    'ups': [
        (r'\bups\b', 0.9),
        (r'united\s*parcel', 1.0),
    ],
    'ne_xcom': [
        (r'nexcom', 1.0),
        (r'ne\s*xcom', 1.0),
    ],
    'sparkletts': [
        (r'sparkletts', 1.0),
        (r'1-800-4-waters', 1.0),
    ],
    'passport_languages': [
        (r'passport\s*to\s*languages', 1.0),
    ],
    'asl_interpreting': [
        (r'asl\s*interpreting', 1.0),
        (r'sign\s*language\s*interpreting', 0.9),
    ],
    'pure_clean': [
        (r'pure\s*clean', 1.0),
    ],
    'medpro_waste': [
        (r'medpro\s*waste', 1.0),
    ],
    'heaths_laundry': [
        (r"heath'?s?\s*laundry", 1.0),
    ],
    'miracle_cleaners': [
        (r'miracle\s*cleaners?', 1.0),
    ],
    'lloyds_dental': [
        (r"lloyd'?s?\s*dental", 1.0),
    ],
    'vyne_dental': [
        (r'vyne\s*dental', 1.0),
        (r'vynedental', 1.0),
    ],
    'builders_electric': [
        (r"builder'?s?\s*electric", 1.0),
    ],
    'swell': [
        (r'\bswell\b', 0.8),
        (r'swell\s*monthly', 1.0),
    ],
}

# Parser file mappings
VENDOR_PARSERS = {
    'epic': 'epic_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'henry': 'henry_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py',
    'darby': 'darby_parser.py',
    'dandy': 'dandy_parser.py',
    'brasseler': 'brasseler_parser.py',
    'ctr_services': 'ctr_services_parser.py',
    'a1_professional': 'a1_professional_parser.py',
    'comcast': 'comcast_parser.py',
    'bridgeford': 'bridgeford_parser.py',
    'general': 'general_invoice_parser.py',
    # NEW: Map new vendors to their parsers (general or dedicated)
    'waterco': 'general_invoice_parser.py',
    'dental_medical_staffing': 'general_invoice_parser.py',
    'crest_oralb': 'general_invoice_parser.py',
    'physicians_resource': 'general_invoice_parser.py',
    'trustworkz': 'general_invoice_parser.py',
    'medpro': 'general_invoice_parser.py',
    'columbia_smiles': 'general_invoice_parser.py',
    # Vendors identified from Unknown invoice review
    'linde_gas': 'linde_gas_parser.py',
    'kettenbach': 'kettenbach_parser.py',
    'republic_services': 'republic_services_parser.py',
    'clipboard_health': 'clipboard_health_parser.py',
    'airgas': 'linde_gas_parser.py',  # Similar format to Linde (medical gases)
    'ultradent': 'general_invoice_parser.py',
    'safeway': 'general_invoice_parser.py',
    'oral_biotech': 'general_invoice_parser.py',
    'oregon_linen': 'general_invoice_parser.py',
    'cintas': 'general_invoice_parser.py',
    'trilogy_medwaste': 'general_invoice_parser.py',
    'glidewell': 'general_invoice_parser.py',
    'do_good_cleaning': 'general_invoice_parser.py',
    'airgas': 'general_invoice_parser.py',
    'shred_it': 'general_invoice_parser.py',
    'pacific_office': 'general_invoice_parser.py',
    # Final review parsers
    'crystal_falls': 'crystal_falls_parser.py',
    'megagen': 'megagen_parser.py',
    'method_procurement': 'general_invoice_parser.py',
    'iron_mountain': 'general_invoice_parser.py',
    'fyle': 'general_invoice_parser.py',
    'usps': 'general_invoice_parser.py',
    'fedex': 'general_invoice_parser.py',
    'ups': 'general_invoice_parser.py',
    'ne_xcom': 'general_invoice_parser.py',
    'sparkletts': 'general_invoice_parser.py',
    'passport_languages': 'general_invoice_parser.py',
    'asl_interpreting': 'general_invoice_parser.py',
    'pure_clean': 'general_invoice_parser.py',
    'medpro_waste': 'general_invoice_parser.py',
    'heaths_laundry': 'general_invoice_parser.py',
    'miracle_cleaners': 'general_invoice_parser.py',
    'lloyds_dental': 'general_invoice_parser.py',
    'vyne_dental': 'general_invoice_parser.py',
    'builders_electric': 'general_invoice_parser.py',
    'swell': 'general_invoice_parser.py',
}


@dataclass
class VendorMatch:
    """Result of vendor detection"""
    vendor: str
    confidence: float
    matched_patterns: List[str]
    parser_file: Optional[str]


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF, with OCR fallback"""
    text = ""
    
    # Try PyMuPDF first
    try:
        import fitz
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text('text')
        doc.close()
        
        if text.strip():
            return text
    except Exception:
        pass
    
    # OCR fallback
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


def detect_vendor_from_filename(filename: str) -> Tuple[Optional[str], float]:
    """Quick vendor detection from filename only"""
    filename_lower = filename.lower()
    
    # High-confidence filename patterns
    patterns = {
        'darby': (['darby', 'darby_invoice'], 0.9),
        'dandy': (['dandy'], 0.9),
        'henry': (['henry', 'henryschein'], 0.9),
        'patterson': (['patterson'], 0.9),
        'epic': (['epic'], 0.8),
        'tc': (['tc_dental', 'tc dental'], 0.9),
        'artisan': (['artisan'], 0.9),
        'exodus': (['exodus'], 0.9),
        'brasseler': (['brasseler'], 0.9),
        'ctr_services': (['ctr'], 0.7),
        'a1_professional': (['a-1', 'aoneprofessional', 'a1_professional'], 0.9),
        'comcast': (['comcast'], 0.9),
        'bridgeford': (['bridgeford', 'bfv'], 0.8),
        # NEW: Additional vendors
        'waterco': (['waterco'], 0.9),
        'dental_medical_staffing': (['dental_medical_staffing', 'staffing_inc'], 0.9),
        'crest_oralb': (['crest', 'oral-b', 'oralb'], 0.9),
        'physicians_resource': (["physician's resource", 'physicians_resource'], 0.9),
        'trustworkz': (['trustworkz'], 0.9),
        'medpro': (['med pro', 'medpro'], 0.9),
        'columbia_smiles': (['columbiasmiles'], 0.9),
        # Vendors from Unknown invoice review
        'linde_gas': (['linde'], 0.9),
        'kettenbach': (['kettenbach'], 0.9),
        'republic_services': (['republic'], 0.8),
        'clipboard_health': (['clipboard'], 0.9),
        'oral_biotech': (['carifree', 'biotech'], 0.9),
        'oregon_linen': (['oregon linen', 'oregonlinen'], 0.9),
        'cintas': (['cintas'], 0.9),
        'trilogy_medwaste': (['trilogy'], 0.9),
        'glidewell': (['glidewell', 'bruxzir'], 0.9),
        'do_good_cleaning': (['dogood', 'do good'], 0.9),
        'airgas': (['airgas'], 0.9),
        'shred_it': (['shred-it', 'shredit'], 0.9),
        'pacific_office': (['pacific office'], 0.9),
        'a1_professional': (['a-1 fire', 'fire protection', 'umpqua'], 0.9),  # Extended for fire services
    }
    
    for vendor, (keywords, confidence) in patterns.items():
        for kw in keywords:
            if kw in filename_lower:
                return vendor, confidence
    
    return None, 0.0


def detect_vendor_from_text(text: str) -> VendorMatch:
    """
    Detect vendor from PDF text content using weighted pattern matching.
    Returns the best match with confidence score.
    """
    text_lower = text.lower()
    
    best_match = None
    best_score = 0.0
    best_patterns = []
    
    for vendor, patterns in VENDOR_PATTERNS.items():
        score = 0.0
        matched = []
        
        for pattern, weight in patterns:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            if matches:
                # Score based on number of matches and weight
                pattern_score = min(1.0, len(matches) * 0.3) * weight
                score += pattern_score
                matched.append(pattern)
        
        # Normalize score (cap at 1.0)
        score = min(1.0, score)
        
        if score > best_score:
            best_score = score
            best_match = vendor
            best_patterns = matched
    
    if best_match:
        parser_file = VENDOR_PARSERS.get(best_match)
        return VendorMatch(
            vendor=best_match,
            confidence=best_score,
            matched_patterns=best_patterns,
            parser_file=parser_file
        )
    
    return VendorMatch(
        vendor='unknown',
        confidence=0.0,
        matched_patterns=[],
        parser_file=None
    )


def detect_vendor(pdf_path: str, confidence_threshold: float = 0.5) -> VendorMatch:
    """
    Main vendor detection function.
    
    Args:
        pdf_path: Path to the PDF file
        confidence_threshold: Minimum confidence to return a match (default 0.5)
        
    Returns:
        VendorMatch with vendor info and confidence score
    """
    filename = os.path.basename(pdf_path)
    
    # Quick check from filename first
    filename_vendor, filename_confidence = detect_vendor_from_filename(filename)
    if filename_vendor and filename_confidence >= confidence_threshold:
        return VendorMatch(
            vendor=filename_vendor,
            confidence=filename_confidence,
            matched_patterns=[f"filename:{filename}"],
            parser_file=VENDOR_PARSERS.get(filename_vendor)
        )
    
    # Extract text and analyze
    text = extract_text_from_pdf(pdf_path)
    if not text.strip():
        return VendorMatch(
            vendor='unknown',
            confidence=0.0,
            matched_patterns=[],
            parser_file=None
        )
    
    # Detect from text content
    match = detect_vendor_from_text(text)
    
    # Boost confidence if filename also matches
    if filename_vendor and filename_vendor == match.vendor:
        match.confidence = min(1.0, match.confidence + 0.2)
        match.matched_patterns.append(f"filename_confirmed:{filename}")
    
    # If below threshold, return as unknown
    if match.confidence < confidence_threshold:
        return VendorMatch(
            vendor='unknown',
            confidence=match.confidence,
            matched_patterns=match.matched_patterns,
            parser_file=VENDOR_PARSERS.get('general')
        )
    
    return match


def get_parser_for_vendor(vendor: str) -> Optional[str]:
    """Get parser filename for a vendor"""
    return VENDOR_PARSERS.get(vendor)


def get_all_vendors() -> List[str]:
    """Get list of all known vendors"""
    return list(VENDOR_PARSERS.keys())


if __name__ == "__main__":
    import sys
    import json
    
    if len(sys.argv) < 2:
        print("Usage: python3 vendor_detector.py <pdf_path> [confidence_threshold]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)
    
    result = detect_vendor(pdf_path, threshold)
    
    print(f"📄 File: {os.path.basename(pdf_path)}")
    print(f"🏢 Vendor: {result.vendor}")
    print(f"📊 Confidence: {result.confidence:.2%}")
    print(f"🔍 Matched: {', '.join(result.matched_patterns)}")
    print(f"📦 Parser: {result.parser_file or 'N/A'}")
    
    # Output JSON for programmatic use
    output = {
        'vendor': result.vendor,
        'confidence': result.confidence,
        'matched_patterns': result.matched_patterns,
        'parser_file': result.parser_file,
    }
    print(f"\n{json.dumps(output, indent=2)}")

