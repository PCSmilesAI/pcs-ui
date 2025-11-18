# Mock Invoice Testing Guide

## Overview
A complete mock paid invoice has been created for testing the payment receipt feature. This invoice appears in the "Complete" tab and displays the full payment details with a clickable receipt link.

## Mock Invoice Details

**Invoice Number:** `MOCK-1763498662595`
**Invoice ID:** `mock_1763498662595_f50635da`
**Amount:** $264.95
**Status:** paid
**Vendor:** Pacific Crest Smiles
**Office:** Milwaukie
**Paid By:** business@pcsmilesai.com
**Paid At:** 2025-11-16T20:44:22.596Z (2 days ago)
**Stripe Transfer ID:** `tr_test_1763498662595_c2f5d378`

## How to View the Mock Invoice

### Option 1: Direct Invoice View
Navigate to the invoice detail page:
```
http://localhost:3000/InvoiceDetailPage?id=mock_1763498662595_f50635da
```

### Option 2: Complete Tab
1. Go to the "Complete" tab
2. Look for invoice `MOCK-1763498662595`
3. Click to open the invoice detail page

## What You'll See

### Invoice Status Section
When viewing the mock invoice, you'll see:

**Payment Details Row** (instead of the editable "Payment Amount" row):
- **Label:** "Payment Details"
- **Date Paid:** "11/16/25 20:44" (when payment cleared through Stripe)
- **Amount:** "$264.95"
- **Receipt Link:** Clickable "Receipt" button

### Receipt Modal
Clicking the "Receipt" link opens a modal showing:

**Stripe Receipt Section:**
- Payment ID: `tr_test_1763498662595_c2f5d378`
- Date Paid: November 16, 2025 at 20:44
- Amount: $264.95
- Status: Succeeded
- Link to full Stripe receipt

**PCS Dashboard Receipt Section:**
- Vendor: Pacific Crest Smiles
- Total Amount Paid: $264.95
- Invoices Paid: 1
- Invoice table showing:
  - Invoice #: MOCK-1763498662595
  - Amount: $264.95
  - Date: (invoice date)
  - PDF link

## Files Created/Modified

### New Scripts
1. **scripts/create-mock-paid-invoice.js**
   - Creates a mock paid invoice in the SQLite database
   - Initializes database tables if needed
   - Usage: `node scripts/create-mock-paid-invoice.js`

2. **scripts/create-mock-stripe-charge.js**
   - Creates a mock Stripe charge JSON file
   - Simulates Stripe API response
   - Usage: `node scripts/create-mock-stripe-charge.js`

### Modified Files
1. **app/api/stripe/payment-history/route.ts**
   - Updated to load mock charges from file in test/dev mode
   - Falls back to real Stripe API in production
   - Merges mock and real charges for testing

### Data Files
1. **pcs_ui_data/pcs.db**
   - SQLite database containing the mock invoice
   - Auto-created by the script

2. **pcs_ui_data/mock-stripe-charges.json**
   - Mock Stripe charge data
   - Loaded by payment-history API in test mode

## Testing the Complete Flow

1. **View Invoice Details**
   - Open the invoice detail page
   - Verify "Payment Details" row appears (not editable "Payment Amount")
   - Check date, amount, and receipt link are displayed

2. **Click Receipt Link**
   - Click the "Receipt" button
   - Modal should open showing both Stripe and PCS receipts
   - Verify all payment information is correct

3. **Check Complete Tab**
   - Navigate to "Complete" tab
   - Invoice should appear in the list
   - Click to view details and receipt

## How It Works

### Invoice Status Flow
1. Invoice created with `status = 'paid'`
2. Includes `paid_at`, `paid_by`, and `stripe_transfer_id` fields
3. When viewed, the component detects `status = 'paid'`
4. Fetches payment history from `/api/stripe/payment-history`
5. Displays payment details row instead of editable amount

### Payment History API
1. Queries Stripe API for charges (production)
2. In test/dev mode, also loads mock charges from JSON file
3. Filters charges by vendor name
4. Returns payment history with invoice IDs from metadata

### Receipt Modal
1. Fetches all invoices associated with the payment
2. Uses `invoiceIds` from Stripe charge metadata
3. Displays Stripe receipt + PCS receipt with invoice details
4. Shows PDF links for each invoice

## Resetting the Mock Data

To create a fresh mock invoice:
```bash
rm pcs_ui_data/pcs.db
rm pcs_ui_data/mock-stripe-charges.json
node scripts/create-mock-paid-invoice.js
node scripts/create-mock-stripe-charge.js
```

## Production Notes

- Mock charges are **only loaded in development/test mode**
- Production uses real Stripe API exclusively
- Mock data files are safe to commit (for testing)
- In production, `STRIPE_TEST_MODE` should be `false`
- Real Stripe charges are fetched from Stripe API

## Testing Multiple Invoices in One Payment

To test a payment with multiple invoices:
1. Create multiple mock invoices with the same `stripe_transfer_id`
2. Update the mock charge metadata to include all invoice IDs
3. Receipt will show all invoices paid in that transaction
4. Receipt link appears on each invoice's detail page


