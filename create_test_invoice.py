#!/usr/bin/env python3
"""
Create a test invoice PDF for Braxton Ellsworth
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib import colors
from datetime import datetime, timedelta
import os

def create_invoice():
    """Create a test invoice PDF"""
    
    # Create PDF
    filename = "test_invoice_braxton.pdf"
    doc = SimpleDocTemplate(filename, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Container for PDF elements
    elements = []
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=6,
        alignment=1  # Center
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#374151'),
        spaceAfter=6
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4b5563')
    )
    
    # Header
    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Spacer(1, 0.2*inch))
    
    # Invoice details
    today = datetime.now()
    due_date = today + timedelta(days=30)
    invoice_number = "INV-2025-001"
    
    invoice_info = [
        ["Invoice #:", invoice_number],
        ["Invoice Date:", today.strftime("%m/%d/%Y")],
        ["Due Date:", due_date.strftime("%m/%d/%Y")],
    ]
    
    invoice_table = Table(invoice_info, colWidths=[1.5*inch, 2*inch])
    invoice_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6b7280')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(invoice_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # From/To section
    from_to_data = [
        ["FROM:", "BILL TO:"],
        ["Braxton Ellsworth", "Pacific Crest Smiles"],
        ["braxtoid@gmail.com", "Multiple Locations"],
        ["Test Vendor", "Oregon & Washington"],
    ]
    
    from_to_table = Table(from_to_data, colWidths=[3*inch, 3*inch])
    from_to_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 11),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#4b5563')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(from_to_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Line items
    line_items = [
        ["Item Code", "Description", "Qty", "Unit Price", "Amount"],
        ["TEST-001", "Consulting Services", "10", "$150.00", "$1,500.00"],
        ["TEST-002", "Software License", "1", "$500.00", "$500.00"],
        ["TEST-003", "Support & Maintenance", "3", "$200.00", "$600.00"],
    ]
    
    line_table = Table(line_items, colWidths=[1*inch, 2.5*inch, 0.8*inch, 1.2*inch, 1.2*inch])
    line_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 10),
        ('FONT', (0, 1), (-1, -1), 'Helvetica', 10),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#4b5563')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(line_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Totals
    totals_data = [
        ["", "", "", "Subtotal:", "$2,600.00"],
        ["", "", "", "Tax (0%):", "$0.00"],
        ["", "", "", "Invoice Total:", "$2,600.00"],
    ]
    
    totals_table = Table(totals_data, colWidths=[1*inch, 2.5*inch, 0.8*inch, 1.2*inch, 1.2*inch])
    totals_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -2), 'Helvetica', 10),
        ('FONT', (0, -1), (-1, -1), 'Helvetica-Bold', 11),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#4b5563')),
        ('TEXTCOLOR', (3, -1), (-1, -1), colors.HexColor('#1f2937')),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (3, -1), (-1, -1), colors.HexColor('#f3f4f6')),
        ('GRID', (3, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Notes
    elements.append(Paragraph("<b>Notes:</b>", heading_style))
    elements.append(Paragraph("This is a test invoice for system testing purposes.", normal_style))
    
    # Build PDF
    doc.build(elements)
    print(f"✅ Created test invoice: {filename}")
    return filename

if __name__ == "__main__":
    create_invoice()

