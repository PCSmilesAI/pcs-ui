#!/usr/bin/env python3
"""
Smart Re-parse Script - ISOLATED from main parsing pipeline

This script is ONLY called when a user clicks "Send back to PCS AI Bot"
on an invoice that failed initial parsing. It does NOT modify or 
interact with the main parsing flow.

Features:
- Targeted extraction based on which fields are missing
- Progressive strategies (standard -> aggressive -> OCR)
- Self-contained - does NOT import from any existing parsers
- Outputs JSON to stdout for the API to consume

Usage:
    python3 smart_reparse.py <pdf_path> [--focus=amount,vendor,date] [--force-ocr] [--invoice-id=XXX]
"""

import os
import sys
import re
import json
import argparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

# ============================================================================
# SELF-CONTAINED TEXT EXTRACTION
# (Does not import from general_invoice_parser or any other existing module)
# ============================================================================

def extract_text_fitz(pdf_path: str) -> str:
    """Extract text using PyMuPDF (fitz)"""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        texts = []
        for page in doc:
            texts.append(page.get_text('text'))
        doc.close()
        return '\n'.join(texts)
    except ImportError:
        return ''
    except Exception as e:
        print(f"[SMART-REPARSE] fitz extraction error: {e}", file=sys.stderr)
        return ''


def extract_text_pdfminer(pdf_path: str) -> str:
    """Extract text using pdfminer.six"""
    try:
        from pdfminer.high_level import extract_text
        return extract_text(pdf_path) or ''
    except ImportError:
        return ''
    except Exception as e:
        print(f"[SMART-REPARSE] pdfminer extraction error: {e}", file=sys.stderr)
        return ''


def extract_text_ocr(pdf_path: str, dpi: int = 300) -> str:
    """Extract text using OCR (pytesseract) - more aggressive, higher DPI"""
    try:
        import fitz
        import pytesseract
        from PIL import Image, ImageEnhance, ImageFilter
        
        doc = fitz.open(pdf_path)
        texts = []
        
        for i, page in enumerate(doc):
            if i >= 3:  # Limit to first 3 pages
                break
            
            # Higher DPI for better OCR
            pix = page.get_pixmap(dpi=dpi)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            
            # Image preprocessing for better OCR
            img = img.convert('L')  # Grayscale
            img = ImageEnhance.Contrast(img).enhance(2.0)  # Increase contrast
            img = img.filter(ImageFilter.SHARPEN)  # Sharpen
            
            text = pytesseract.image_to_string(img)
            texts.append(text)
        
        doc.close()
        return '\n'.join(texts)
    except ImportError as e:
        print(f"[SMART-REPARSE] OCR import error: {e}", file=sys.stderr)
        return ''
    except Exception as e:
        print(f"[SMART-REPARSE] OCR extraction error: {e}", file=sys.stderr)
        return ''


def get_pdf_text(pdf_path: str, force_ocr: bool = False) -> Tuple[str, str]:
    """
    Get text from PDF using multiple strategies.
    Returns (text, extraction_method)
    """
    if force_ocr:
        print("[SMART-REPARSE] Forcing OCR extraction...", file=sys.stderr)
        text = extract_text_ocr(pdf_path, dpi=300)
        if text and len(text.strip()) > 20:
            return text, 'ocr_forced'
    
    # Try fitz first
    text = extract_text_fitz(pdf_path)
    if text and len(text.strip()) > 50:
        return text, 'fitz'
    
    # Try pdfminer
    text = extract_text_pdfminer(pdf_path)
    if text and len(text.strip()) > 50:
        return text, 'pdfminer'
    
    # Fallback to OCR
    print("[SMART-REPARSE] Text extraction yielded little text, trying OCR...", file=sys.stderr)
    text = extract_text_ocr(pdf_path, dpi=300)
    if text and len(text.strip()) > 20:
        return text, 'ocr_fallback'
    
    return text or '', 'failed'


# ============================================================================
# AMOUNT EXTRACTION STRATEGIES
# ============================================================================

def extract_amount_standard(text: str) -> Optional[float]:
    """Standard amount extraction patterns"""
    patterns = [
        r"(?:total|amount\s*due|balance\s*due|grand\s*total|invoice\s*total)\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"(?:pay\s*this\s*amount|please\s*pay)\s*:?\s*\$?\s*([\d,]+\.?\d*)",
        r"(?:net\s*amount|net\s*total)\s*:?\s*\$?\s*([\d,]+\.?\d*)",
    ]
    
    amounts = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            try:
                val = float(m.replace(',', ''))
                if val > 0:
                    amounts.append(val)
            except ValueError:
                continue
    
    return max(amounts) if amounts else None


def extract_amount_aggressive(text: str) -> Optional[float]:
    """
    Aggressive amount extraction - find largest dollar amount on page.
    Used when standard patterns fail.
    """
    # Find all dollar amounts
    pattern = r'\$\s*([\d,]+\.\d{2})'
    matches = re.findall(pattern, text)
    
    amounts = []
    for m in matches:
        try:
            val = float(m.replace(',', ''))
            # Filter out likely non-total amounts (too small or suspiciously round)
            if val >= 1.00:
                amounts.append(val)
        except ValueError:
            continue
    
    if not amounts:
        return None
    
    # Return the largest amount (most likely the total)
    return max(amounts)


def extract_amount_from_line_items(text: str) -> Optional[float]:
    """
    Try to sum line items if we can find them.
    """
    # Look for lines with amounts
    line_amount_pattern = r'^\s*.*?\s+\$?([\d,]+\.\d{2})\s*$'
    
    amounts = []
    for line in text.split('\n'):
        line = line.strip()
        if not line or len(line) < 5:
            continue
        
        # Skip header/footer lines
        skip_words = ['subtotal', 'tax', 'shipping', 'total', 'balance', 'due', 
                      'invoice', 'date', 'bill to', 'ship to', 'page', 'payment']
        if any(skip in line.lower() for skip in skip_words):
            continue
        
        match = re.search(r'\$?([\d,]+\.\d{2})\s*$', line)
        if match:
            try:
                val = float(match.group(1).replace(',', ''))
                if 0.01 <= val <= 50000:  # Reasonable line item range
                    amounts.append(val)
            except ValueError:
                continue
    
    if len(amounts) >= 2:  # Need at least 2 line items
        total = sum(amounts)
        if total > 0:
            return round(total, 2)
    
    return None


def extract_amount(text: str, focus_amount: bool = False) -> Tuple[Optional[float], str]:
    """
    Main amount extraction with progressive strategies.
    Returns (amount, strategy_used)
    """
    # Strategy 1: Standard patterns
    amount = extract_amount_standard(text)
    if amount:
        return amount, 'standard'
    
    if focus_amount:
        # Strategy 2: Line item sum (only if focusing on amount)
        amount = extract_amount_from_line_items(text)
        if amount:
            return amount, 'line_items_sum'
        
        # Strategy 3: Aggressive (largest dollar amount)
        amount = extract_amount_aggressive(text)
        if amount:
            return amount, 'aggressive_largest'
    
    return None, 'not_found'


# ============================================================================
# VENDOR EXTRACTION STRATEGIES
# ============================================================================

KNOWN_VENDORS = [
    'Henry Schein', 'Patterson Dental', 'Epic Dental', 'TC Dental',
    'Artisan Dental', 'Exodus', 'Darby Dental', 'Dandy', 'Brasseler',
    'Comcast', 'Bridgeford', 'CTR Services', 'A1 Professional',
    'Benco Dental', 'Ultradent', 'Dentsply Sirona', 'Kerr Dental',
    '3M Dental', 'Ivoclar', 'Nobel Biocare', 'Straumann',
    'Glidewell', 'Pacific Dental', 'Burkhart Dental'
]


def extract_vendor_patterns(text: str) -> Optional[str]:
    """Extract vendor using pattern matching"""
    patterns = [
        r"(?:from|bill\s*from|sold\s*by|vendor|supplier)\s*:?\s*([A-Za-z][A-Za-z0-9\s\-&'\.]{3,40})",
        r"^([A-Z][A-Za-z0-9\s\-&'\.]{3,30})\s*\n",  # First line might be vendor
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            vendor = match.group(1).strip()
            # Filter out common false positives
            if vendor.lower() not in ['invoice', 'bill', 'statement', 'date', 'to', 'the']:
                return vendor
    
    return None


def extract_vendor_header(text: str) -> Optional[str]:
    """Extract vendor from header area (first 20% of text)"""
    lines = text.split('\n')
    header_lines = lines[:max(5, len(lines) // 5)]
    header_text = '\n'.join(header_lines)
    
    # Look for company name patterns in header
    for line in header_lines:
        line = line.strip()
        if not line or len(line) < 3 or len(line) > 50:
            continue
        
        # Skip lines that look like addresses or dates
        if re.search(r'\d{5}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|page\s*\d', line, re.IGNORECASE):
            continue
        
        # Check if this looks like a company name
        if re.match(r'^[A-Z][A-Za-z\s\-&\'\.]+$', line) and len(line) >= 5:
            return line
    
    return None


def extract_vendor_fuzzy_match(text: str) -> Optional[str]:
    """Try to fuzzy match known vendors"""
    text_lower = text.lower()
    
    for vendor in KNOWN_VENDORS:
        # Direct match
        if vendor.lower() in text_lower:
            return vendor
        
        # Partial match (first word)
        first_word = vendor.split()[0].lower()
        if len(first_word) >= 4 and first_word in text_lower:
            return vendor
    
    return None


def extract_vendor_email_domain(text: str) -> Optional[str]:
    """Extract vendor from email domain"""
    email_pattern = r'[\w\.-]+@([\w\.-]+\.\w+)'
    matches = re.findall(email_pattern, text)
    
    if matches:
        domain = matches[0].lower()
        # Convert domain to vendor name
        domain_parts = domain.split('.')
        if domain_parts:
            vendor = domain_parts[0].replace('-', ' ').replace('_', ' ').title()
            if len(vendor) >= 3:
                return vendor
    
    return None


def extract_vendor(text: str, focus_vendor: bool = False) -> Tuple[Optional[str], str]:
    """
    Main vendor extraction with progressive strategies.
    Returns (vendor, strategy_used)
    """
    # Strategy 1: Known vendor fuzzy match
    vendor = extract_vendor_fuzzy_match(text)
    if vendor:
        return vendor, 'fuzzy_match'
    
    # Strategy 2: Pattern matching
    vendor = extract_vendor_patterns(text)
    if vendor:
        return vendor, 'pattern'
    
    if focus_vendor:
        # Strategy 3: Header extraction
        vendor = extract_vendor_header(text)
        if vendor:
            return vendor, 'header'
        
        # Strategy 4: Email domain
        vendor = extract_vendor_email_domain(text)
        if vendor:
            return vendor, 'email_domain'
    
    return None, 'not_found'


# ============================================================================
# DATE EXTRACTION
# ============================================================================

def extract_dates(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract invoice date and due date"""
    date_pattern = r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'
    
    invoice_date = None
    due_date = None
    
    # Invoice date patterns
    for pattern in [
        r"(?:invoice\s*date|date)\s*:?\s*" + date_pattern,
        r"(?:dated?)\s*:?\s*" + date_pattern,
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            invoice_date = match.group(1)
            break
    
    # Due date patterns
    for pattern in [
        r"(?:due\s*date|payment\s*due|due)\s*:?\s*" + date_pattern,
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            due_date = match.group(1)
            break
    
    # Fallback: first date in document
    if not invoice_date:
        match = re.search(date_pattern, text)
        if match:
            invoice_date = match.group(1)
    
    return invoice_date, due_date


# ============================================================================
# INVOICE NUMBER EXTRACTION
# ============================================================================

def extract_invoice_number(text: str) -> Optional[str]:
    """Extract invoice number"""
    patterns = [
        r"invoice\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"inv\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"invoice\s*number\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"reference\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
        r"bill\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result = match.group(1).strip()
            if result.lower() not in ['date', 'to', 'from', 'the', 'and', 'number']:
                return result
    
    return None


# ============================================================================
# OFFICE LOCATION EXTRACTION
# ============================================================================

OFFICE_LOCATIONS = [
    'Roseburg', 'Lebanon', 'Ridgefield', 'Milwaukie', 
    'Columbia', 'Salem', 'Eugene', 'Vancouver', 'Riddle'
]


def extract_office_location(text: str) -> Optional[str]:
    """Extract office location"""
    text_lower = text.lower()
    
    for location in OFFICE_LOCATIONS:
        if location.lower() in text_lower:
            return location
    
    return None


# ============================================================================
# MAIN SMART REPARSE FUNCTION
# ============================================================================

def smart_reparse(pdf_path: str, focus_fields: List[str], force_ocr: bool = False) -> Dict:
    """
    Main smart reparse function.
    
    Args:
        pdf_path: Path to the PDF file
        focus_fields: List of fields to focus on (e.g., ['amount', 'vendor'])
        force_ocr: Force OCR extraction
    
    Returns:
        Dictionary with extracted data and metadata
    """
    result = {
        'success': False,
        'pdf_path': pdf_path,
        'extraction_method': None,
        'focus_fields': focus_fields,
        'extracted': {},
        'strategies_used': {},
        'errors': []
    }
    
    # Check file exists
    if not os.path.exists(pdf_path):
        result['errors'].append(f"PDF file not found: {pdf_path}")
        return result
    
    # Extract text
    text, extraction_method = get_pdf_text(pdf_path, force_ocr)
    result['extraction_method'] = extraction_method
    
    if not text or len(text.strip()) < 20:
        result['errors'].append("Could not extract text from PDF")
        return result
    
    print(f"[SMART-REPARSE] Text extracted ({len(text)} chars) via {extraction_method}", file=sys.stderr)
    
    focus_amount = 'amount' in focus_fields or not focus_fields
    focus_vendor = 'vendor' in focus_fields or not focus_fields
    focus_date = 'date' in focus_fields or not focus_fields
    
    # Extract amount
    amount, amount_strategy = extract_amount(text, focus_amount)
    if amount:
        result['extracted']['amount'] = amount
        result['extracted']['amount_cents'] = int(round(amount * 100))
        result['strategies_used']['amount'] = amount_strategy
        print(f"[SMART-REPARSE] Amount: ${amount:.2f} (via {amount_strategy})", file=sys.stderr)
    
    # Extract vendor
    vendor, vendor_strategy = extract_vendor(text, focus_vendor)
    if vendor:
        result['extracted']['vendor'] = vendor
        result['strategies_used']['vendor'] = vendor_strategy
        print(f"[SMART-REPARSE] Vendor: {vendor} (via {vendor_strategy})", file=sys.stderr)
    
    # Extract dates
    invoice_date, due_date = extract_dates(text)
    if invoice_date:
        result['extracted']['invoice_date'] = invoice_date
        result['strategies_used']['invoice_date'] = 'pattern'
    if due_date:
        result['extracted']['due_date'] = due_date
        result['strategies_used']['due_date'] = 'pattern'
    
    # Extract invoice number
    invoice_number = extract_invoice_number(text)
    if invoice_number:
        result['extracted']['invoice_number'] = invoice_number
        result['strategies_used']['invoice_number'] = 'pattern'
    
    # Extract office location
    office = extract_office_location(text)
    if office:
        result['extracted']['office_location'] = office
        result['strategies_used']['office_location'] = 'match'
    
    # Determine success
    has_amount = 'amount' in result['extracted']
    has_vendor = 'vendor' in result['extracted']
    
    if has_amount and has_vendor:
        result['success'] = True
        result['parsing_status'] = 'success'
    elif has_amount or has_vendor:
        result['success'] = True
        result['parsing_status'] = 'partial'
        if not has_amount:
            result['errors'].append('Amount not extracted')
        if not has_vendor:
            result['errors'].append('Vendor not extracted')
    else:
        result['parsing_status'] = 'failed'
        result['errors'].append('No data could be extracted')
    
    return result


# ============================================================================
# CLI ENTRY POINT
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Smart Re-parse Script - Targeted extraction for failed invoices'
    )
    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('--focus', default='', help='Comma-separated list of fields to focus on (amount,vendor,date)')
    parser.add_argument('--force-ocr', action='store_true', help='Force OCR extraction')
    parser.add_argument('--invoice-id', default='', help='Invoice ID for reference')
    
    args = parser.parse_args()
    
    focus_fields = [f.strip().lower() for f in args.focus.split(',') if f.strip()]
    
    print(f"[SMART-REPARSE] Starting reparse for: {args.pdf_path}", file=sys.stderr)
    print(f"[SMART-REPARSE] Focus fields: {focus_fields or 'all'}", file=sys.stderr)
    print(f"[SMART-REPARSE] Force OCR: {args.force_ocr}", file=sys.stderr)
    
    result = smart_reparse(args.pdf_path, focus_fields, args.force_ocr)
    
    # Add invoice ID to result
    if args.invoice_id:
        result['invoice_id'] = args.invoice_id
    
    # Output JSON to stdout
    print(json.dumps(result, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if result['success'] else 1)


if __name__ == '__main__':
    main()

