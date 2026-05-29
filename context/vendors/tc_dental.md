# TC Dental — Vendor Parser Rules

Load this file when working on TC Dental invoice parsing.

## Vendor Profile

| Field | Value |
|-------|-------|
| Vendor Name | TC Dental |
| Type | Dental lab (crown, bridge, aligner, implant work) |
| Default GL Account | 52210 Dental Lab Fees |
| Aligner work GL | 52220 Aligner Lab Fees |
| Invoice format | PDF, typically multi-page with patient-level line items |
| Parser file | `tc_dental_parser.py` (root level) |

## Parsing Rules

1. **Lab work vs aligner work:** If line item description contains "aligner", "Invisalign", "clear aligner", or "SureSmile" → 52220 Aligner Lab Fees. All other lab work → 52210 Dental Lab Fees.
2. **Patient references:** TC Dental invoices list patient names or case numbers on each line. These are for internal tracking only — do not include patient names in QBO bill descriptions (PHI).
3. **Never categorize TC Dental to 52110 Dental Supplies.** TC Dental is lab-only.
4. **Due dates:** TC Dental typically has net-30 terms. Parse the invoice date and add 30 days if no explicit due date.

## Invoice Structure

TC Dental PDFs typically contain:
- Header: invoice number, invoice date, PCS billing address
- Line items: case number, description, patient reference (strip this for QBO), quantity, unit price, line total
- Footer: subtotal, tax (if applicable), total due

## Active Status

TC Dental is the first live vendor in the PCS AI AP processing pipeline as of 2025.
