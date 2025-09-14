#!/usr/bin/env python3
"""
Multi-Page Invoice Processor
Intelligently detects and processes separate invoices within a single PDF
"""

import fitz
import pytesseract
from PIL import Image
import io
import re
import json
import os
from datetime import datetime
from typing import List, Dict, Optional

class MultiPageInvoiceProcessor:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)
        self.invoices = []
        
    def detect_invoice_boundaries(self) -> List[int]:
        """
        Detect which pages contain the start of new invoices
        Returns list of page indices where new invoices begin
        """
        boundaries = []
        
        for i in range(len(self.doc)):
            page = self.doc.load_page(i)
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            text = pytesseract.image_to_string(img, config='--psm 6')
            
            # Look for TC Dental header and invoice number pattern
            if self._is_invoice_start_page(text):
                boundaries.append(i)
                
        return boundaries
    
    def _is_invoice_start_page(self, text: str) -> bool:
        """
        Determine if this page starts a new invoice
        """
        # Check for TC Dental header
        if "TC Dental Laboratory" not in text:
            return False
            
        # Check for invoice number pattern (260-XXX)
        invoice_patterns = [
            r'260-\d{3}',
            r'Invoice Number:\s*260-\d{3}',
            r'\* 260-\d{3} \*'
        ]
        
        for pattern in invoice_patterns:
            if re.search(pattern, text):
                return True
                
        return False
    
    def extract_invoice_data(self, page_index: int) -> Optional[Dict]:
        """
        Extract invoice data from a specific page
        """
        page = self.doc.load_page(page_index)
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        text = pytesseract.image_to_string(img, config='--psm 6')
        
        # Extract invoice number
        invoice_number = self._extract_invoice_number(text)
        if not invoice_number:
            return None
            
        # Extract patient name
        patient_name = self._extract_patient_name(text)
        
        # Extract doctor name
        doctor_name = self._extract_doctor_name(text)
        
        # Extract invoice date
        invoice_date = self._extract_invoice_date(text)
        
        # Extract due date
        due_date = self._extract_due_date(text)
        
        # Extract total amount
        total = self._extract_total(text)
        
        # Extract line items
        line_items = self._extract_line_items(text)
        
        # Extract office location
        office_location = self._extract_office_location(text)
        
        return {
            "vendor": "tc dental laboratory, inc.",
            "vendor_name": "TC Dental",
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "due_date": due_date,
            "total": total,
            "office_location": office_location,
            "patient_name": patient_name,
            "doctor_name": doctor_name,
            "line_items": line_items,
            "source_page": page_index + 1,
            "source_pdf": os.path.basename(self.pdf_path),
            "pdf_path": f"/api/pdf/{os.path.basename(self.pdf_path)}",
            "id": f"tc_{invoice_number}_{page_index + 1}",
            "clinic_id": office_location,
            "invoice_total": total,
            "vendor_name": "TC Dental"
        }
    
    def _extract_invoice_number(self, text: str) -> Optional[str]:
        """Extract invoice number from text"""
        patterns = [
            r'Invoice Number:\s*(260-\d{3})',
            r'\* (260-\d{3}) \*',
            r'(260-\d{3})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None
    
    def _extract_patient_name(self, text: str) -> str:
        """Extract patient name from text"""
        # Look for "Patient:" followed by name (before "invoice Date")
        match = re.search(r'Patient:\s*([^\\n]+?)(?=\\s+invoice Date|\\s+Doctor|$)', text)
        if match:
            name = match.group(1).strip()
            # Clean up any extra text
            if 'invoice Date' in name:
                name = name.split('invoice Date')[0].strip()
            return name
        
        # Look for "Patient Name:" in survey section
        match = re.search(r'Patient Name:\s*([^\\n]+)', text)
        if match:
            return match.group(1).strip()
            
        return "Unknown"
    
    def _extract_doctor_name(self, text: str) -> str:
        """Extract doctor name from text"""
        # Look for "Doctor:" followed by name (before "Patient")
        match = re.search(r'Doctor:\s*([^\\n]+?)(?=\\s+Patient|$)', text)
        if match:
            name = match.group(1).strip()
            # Clean up any extra text
            if 'Patient' in name:
                name = name.split('Patient')[0].strip()
            return name
        
        # Look for "Doctor Name:" in survey section
        match = re.search(r'Doctor Name:\s*([^\\n]+)', text)
        if match:
            return match.group(1).strip()
            
        return "Unknown"
    
    def _extract_invoice_date(self, text: str) -> str:
        """Extract invoice date from text"""
        # Look for "Invoice Date:" pattern
        match = re.search(r'Invoice Date:\s*(\d{1,2}/\d{1,2}/\d{4})', text)
        if match:
            return match.group(1)
        return ""
    
    def _extract_due_date(self, text: str) -> str:
        """Extract due date from text"""
        # Look for "Due Date:" pattern
        match = re.search(r'Due Date:\s*(\d{1,2}/\d{1,2}/\d{4})', text)
        if match:
            return match.group(1)
        return ""
    
    def _extract_total(self, text: str) -> str:
        """Extract total amount from text"""
        # Look for SUBTOTAL pattern with various formats
        patterns = [
            r'SUB TOTAL[:\s\$]*([\d,]+\.\d{2})',
            r'SUBTOTAL[:\s\$]*([\d,]+\.\d{2})',
            r'SUB TOTAL[:\s\$]*\$([\d,]+\.\d{2})',
            r'SUBTOTAL[:\s\$]*\$([\d,]+\.\d{2})',
            r'SUB TOTAL[:\s]*([\d,]+\.\d{2})',
            r'SUBTOTAL[:\s]*([\d,]+\.\d{2})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        # Fallback: look for any dollar amount near the end
        dollar_matches = re.findall(r'\$([\d,]+\.\d{2})', text)
        if dollar_matches:
            # Return the last (likely largest) amount
            return max(dollar_matches, key=lambda x: float(x.replace(',', '')))
            
        return "0.00"
    
    def _extract_line_items(self, text: str) -> List[Dict]:
        """Extract line items from text"""
        line_items = []
        
        # Find the line items section
        lines = text.split('\n')
        in_items_section = False
        
        for line in lines:
            if 'ITEM DESCRIPTION' in line and 'UNIT PRICE' in line:
                in_items_section = True
                continue
                
            if in_items_section:
                if re.search(r'(SUB TOTAL|Note|CUSTOMER SATISFACTION)', line, re.IGNORECASE):
                    break
                    
                if not line.strip():
                    continue
                    
                # Try to match line item pattern
                line_match = re.match(r'(.*?)\$\s*([\d,.]+)\s+([\d,.]+)\s+\$\s*([\d,.]+)', line)
                if line_match:
                    description = line_match.group(1).strip()
                    unit_price = line_match.group(2)
                    quantity = line_match.group(3)
                    line_total = line_match.group(4)
                    
                    line_items.append({
                        "product_number": "N/A",
                        "product_name": description,
                        "Quantity": quantity,
                        "unit_price": unit_price,
                        "line_item_total": line_total
                    })
        
        return line_items
    
    def _extract_office_location(self, text: str) -> str:
        """Extract office location from text"""
        # Look for office name in the invoice
        if "Pacific Crest Smiles - Salem" in text:
            return "Salem"
        return "Salem"  # Default for TC Dental
    
    def process_all_invoices(self) -> List[Dict]:
        """
        Process all invoices in the PDF
        """
        print(f"🔍 Processing multi-page PDF: {os.path.basename(self.pdf_path)}")
        print(f"📄 Total pages: {len(self.doc)}")
        
        # Detect invoice boundaries
        boundaries = self.detect_invoice_boundaries()
        print(f"🎯 Found {len(boundaries)} invoice boundaries: {boundaries}")
        
        # Process each invoice
        for i, page_index in enumerate(boundaries):
            print(f"📋 Processing invoice {i+1} from page {page_index + 1}")
            
            invoice_data = self.extract_invoice_data(page_index)
            if invoice_data:
                self.invoices.append(invoice_data)
                print(f"✅ Extracted: {invoice_data['invoice_number']} - {invoice_data['patient_name']} - ${invoice_data['total']}")
            else:
                print(f"❌ Failed to extract invoice from page {page_index + 1}")
        
        print(f"🎉 Successfully processed {len(self.invoices)} invoices")
        return self.invoices
    
    def save_invoices(self, output_dir: str = "output_jsons"):
        """
        Save each invoice as a separate JSON file
        """
        os.makedirs(output_dir, exist_ok=True)
        
        base_filename = os.path.splitext(os.path.basename(self.pdf_path))[0]
        
        for i, invoice in enumerate(self.invoices):
            # Create unique filename for each invoice
            filename = f"{base_filename}_invoice_{i+1}_{invoice['invoice_number']}.json"
            filepath = os.path.join(output_dir, filename)
            
            with open(filepath, 'w') as f:
                json.dump(invoice, f, indent=2)
            
            print(f"💾 Saved: {filename}")
    
    def close(self):
        """Close the PDF document"""
        self.doc.close()

def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python3 multipage_invoice_processor.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)
    
    # Process the multi-page PDF
    processor = MultiPageInvoiceProcessor(pdf_path)
    
    try:
        invoices = processor.process_all_invoices()
        processor.save_invoices()
        
        print(f"\n🎯 SUMMARY:")
        print(f"📄 PDF: {os.path.basename(pdf_path)}")
        print(f"📋 Pages: {len(processor.doc)}")
        print(f"✅ Invoices: {len(invoices)}")
        
        for i, invoice in enumerate(invoices, 1):
            print(f"  {i}. {invoice['invoice_number']} - {invoice['patient_name']} - ${invoice['total']}")
            
    finally:
        processor.close()

if __name__ == "__main__":
    main()
