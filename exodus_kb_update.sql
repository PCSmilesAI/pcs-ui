UPDATE vendor_knowledge_bases 
SET knowledge_prompt = 'You are parsing invoices from Exodus Dental Solutions, a dental lab in Vancouver, WA.

EXODUS INVOICE LAYOUT:
- Header: Exodus Dental Solutions with address (701 NE 136th Ave, Suite 200, Vancouver, WA 98684)
- Phone: 1844.396.3871 ext 3
- Label: INVOICE appears prominently
- Invoice Number: Format is No. XXXX (e.g., No. 6208)
- Invoice Date: Directly below invoice number in MM/DD/YYYY format (e.g., 12/16/2025)
- Ship To Section: Ship To: followed by dental office name and address
- Patient Name: Patient: PATIENT NAME line indicates the patient
- Line Items: Description column followed by Amount column
- Total: Total: $XX.XX at bottom

EXTRACTION REQUIREMENTS:
1. invoice_number: Extract digits after No. (e.g., 6208 from No. 6208)
2. invoice_date: Date in MM/DD/YYYY format, convert to YYYY-MM-DD
3. due_date: Exodus terms are Net 30 - calculate 30 days from invoice_date
4. vendor_name: Always Exodus Dental Solutions
5. total: Amount after Total: without $ symbol
6. office_location: The dental office name from Ship To: section (e.g., Ridgefield from Smiles Dental - Ridgefield)
7. line_items: Each dental item (crowns, zirconia, etc.) with description and amount

COMMON LINE ITEMS:
- Full-Contour Zirconia #XX (tooth number)
- Crown, Bridge components
- Dental lab services

SHIP TO LOCATIONS (Pacific Crest Smiles offices):
- Smiles Dental - Ridgefield -> office_location: Ridgefield
- Smiles Dental - Eugene -> office_location: Eugene
- Smiles Dental - Salem -> office_location: Salem
- Smiles Dental - Columbia -> office_location: Columbia
- Smiles Dental - Roseburg -> office_location: Roseburg
- Smiles Dental - Lebanon -> office_location: Lebanon
- Smiles Dental - Milwaukie -> office_location: Milwaukie

OUTPUT FORMAT:
Return ONLY valid JSON with these fields. No explanation text.',
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE vendor_name = 'Exodus Dental Solutions';
