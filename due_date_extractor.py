"""
Utility module for extracting due dates from invoice text.
Supports both exact due dates and relative due dates (e.g., "Due 60 days from date").
"""

import re
from datetime import datetime, timedelta
from typing import Optional, Tuple


def extract_due_date(text: str, invoice_date: Optional[str] = None) -> Optional[str]:
    """
    Extract due date from invoice text.
    
    Args:
        text: The full text content of the invoice
        invoice_date: The invoice date in MM/DD/YYYY or YYYY-MM-DD format (for relative calculations)
    
    Returns:
        Due date in MM/DD/YYYY format, or None if not found
    """
    # First try to find exact due date
    exact_due_date = _extract_exact_due_date(text)
    if exact_due_date:
        return exact_due_date
    
    # If no exact due date found, try relative due date
    if invoice_date:
        relative_due_date = _extract_relative_due_date(text, invoice_date)
        if relative_due_date:
            return relative_due_date
    
    return None


def _extract_exact_due_date(text: str) -> Optional[str]:
    """
    Extract exact due date from text using various patterns.
    
    Args:
        text: The invoice text
        
    Returns:
        Due date in MM/DD/YYYY format, or None if not found
    """
    # Common due date patterns
    patterns = [
        # "Due Date: MM/DD/YYYY"
        r'[Dd]ue\s+[Dd]ate\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Due By: MM/DD/YYYY"
        r'[Dd]ue\s+[Bb]y\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Due: MM/DD/YYYY"
        r'[Dd]ue\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Payment Due: MM/DD/YYYY"
        r'[Pp]ayment\s+[Dd]ue\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Amount Due: MM/DD/YYYY" (sometimes due date appears after amount)
        r'[Aa]mount\s+[Dd]ue\s*:?\s*\$?[\d,]+\.?\d*\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Net 30" or "Net 60" with date
        r'[Nn]et\s+\d+\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        # "Terms: Net 30 MM/DD/YYYY"
        r'[Tt]erms?\s*:?\s*[Nn]et\s+\d+\s*(\d{1,2}/\d{1,2}/\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            due_date = match.group(1)
            # Validate the date format
            try:
                datetime.strptime(due_date, '%m/%d/%Y')
                return due_date
            except ValueError:
                continue
    
    return None


def _extract_relative_due_date(text: str, invoice_date: str) -> Optional[str]:
    """
    Extract relative due date from text (e.g., "Due 60 days from date").
    
    Args:
        text: The invoice text
        invoice_date: The invoice date in MM/DD/YYYY or YYYY-MM-DD format
        
    Returns:
        Calculated due date in MM/DD/YYYY format, or None if not found
    """
    # Parse invoice date
    try:
        if '/' in invoice_date:
            # MM/DD/YYYY format
            inv_date = datetime.strptime(invoice_date, '%m/%d/%Y')
        else:
            # YYYY-MM-DD format
            inv_date = datetime.strptime(invoice_date, '%Y-%m-%d')
    except ValueError:
        return None
    
    # Patterns for relative due dates
    patterns = [
        # "Due X days from date"
        r'[Dd]ue\s+(\d+)\s+[Dd]ays?\s+[Ff]rom\s+[Dd]ate',
        # "Net X days"
        r'[Nn]et\s+(\d+)\s+[Dd]ays?',
        # "Payment terms: X days"
        r'[Pp]ayment\s+[Tt]erms?\s*:?\s*(\d+)\s+[Dd]ays?',
        # "Terms: Net X"
        r'[Tt]erms?\s*:?\s*[Nn]et\s+(\d+)',
        # "X days from invoice date"
        r'(\d+)\s+[Dd]ays?\s+[Ff]rom\s+[Ii]nvoice\s+[Dd]ate',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                days = int(match.group(1))
                due_date = inv_date + timedelta(days=days)
                return due_date.strftime('%m/%d/%Y')
            except (ValueError, TypeError):
                continue
    
    return None


def normalize_due_date(due_date: str) -> str:
    """
    Normalize due date to MM/DD/YYYY format.
    
    Args:
        due_date: Due date in various formats
        
    Returns:
        Normalized due date in MM/DD/YYYY format
    """
    if not due_date:
        return ""
    
    # Try different date formats
    formats = [
        '%m/%d/%Y',
        '%m/%d/%y',
        '%Y-%m-%d',
        '%m-%d-%Y',
        '%m-%d-%y',
    ]
    
    for fmt in formats:
        try:
            date_obj = datetime.strptime(due_date, fmt)
            return date_obj.strftime('%m/%d/%Y')
        except ValueError:
            continue
    
    # If no format matches, return as is
    return due_date


# Test function for debugging
def test_due_date_extraction():
    """Test the due date extraction with sample text."""
    test_cases = [
        {
            "text": "Invoice Date: 01/15/2025\nDue Date: 02/15/2025",
            "invoice_date": "01/15/2025",
            "expected": "02/15/2025"
        },
        {
            "text": "Invoice Date: 01/15/2025\nDue 30 days from date",
            "invoice_date": "01/15/2025",
            "expected": "02/14/2025"  # 30 days later
        },
        {
            "text": "Net 60 days",
            "invoice_date": "01/15/2025",
            "expected": "03/16/2025"  # 60 days later
        },
        {
            "text": "Payment Due: 03/01/2025",
            "invoice_date": "01/15/2025",
            "expected": "03/01/2025"
        }
    ]
    
    for i, test_case in enumerate(test_cases):
        result = extract_due_date(test_case["text"], test_case["invoice_date"])
        print(f"Test {i+1}: {result} (expected: {test_case['expected']})")


if __name__ == "__main__":
    test_due_date_extraction()
