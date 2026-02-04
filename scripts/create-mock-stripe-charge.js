#!/usr/bin/env node

/**
 * Script to create a mock Stripe charge for testing the payment receipt feature
 * This simulates what would be returned from the Stripe API
 * Usage: node scripts/create-mock-stripe-charge.js <stripeTransferId> <invoiceId>
 */

const fs = require('fs');
const path = require('path');

// Get arguments
const stripeTransferId = process.argv[2] || 'tr_test_1763498662595_c2f5d378';
const invoiceId = process.argv[3] || 'mock_1763498662595_f50635da';

// Create mock charges file for testing
const mockChargesDir = path.join(process.cwd(), 'pcs_ui_data');
if (!fs.existsSync(mockChargesDir)) {
  fs.mkdirSync(mockChargesDir, { recursive: true });
}

const mockChargesFile = path.join(mockChargesDir, 'mock-stripe-charges.json');

// Extract invoice number from ID if needed
const invoiceNumber = invoiceId.includes('MOCK') ? invoiceId : `MOCK-${Date.now()}`;

const mockCharge = {
  id: stripeTransferId,
  object: 'charge',
  amount: 26495, // $264.95 in cents
  amount_captured: 26495,
  amount_refunded: 0,
  captured: true,
  created: Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60), // 2 days ago
  currency: 'usd',
  customer: null,
  description: `Payment for invoice ${invoiceNumber}`,
  destination: 'acct_test_vendor',
  dispute: null,
  disputed: false,
  failure_code: null,
  failure_message: null,
  fraud_details: null,
  invoice: null,
  livemode: false,
  metadata: {
    invoiceIds: invoiceId,
    invoiceNumber: invoiceNumber,
    vendor: 'Pacific Crest Smiles',
    paidBy: 'business@pcsmilesai.com',
    testMode: 'true',
  },
  outcome: {
    network_status: 'approved_by_network',
    reason: null,
    risk_level: 'normal',
    risk_score: 32,
    seller_message: 'Payment complete.',
    type: 'authorized',
  },
  paid: true,
  payment_intent: null,
  payment_method: 'card_test',
  payment_method_details: {
    card: {
      brand: 'visa',
      checks: {
        address_line1_check: null,
        address_postal_code_check: null,
        cvc_check: 'pass',
      },
      country: 'US',
      exp_month: 12,
      exp_year: 2025,
      fingerprint: 'test_fingerprint',
      funding: 'credit',
      installments: null,
      last4: '4242',
      mandate: null,
      network: 'visa',
      three_d_secure: null,
      wallet: null,
    },
    type: 'card',
  },
  receipt_email: null,
  receipt_number: null,
  receipt_url: 'https://receipts.stripe.com/test_receipt',
  refunded: false,
  refunds: {
    object: 'list',
    data: [],
    has_more: false,
    total_count: 0,
    url: '/v1/charges/test/refunds',
  },
  review: null,
  shipping: null,
  source: {
    id: 'card_test',
    object: 'card',
    address_city: null,
    address_country: null,
    address_line1: null,
    address_line1_check: null,
    address_line2: null,
    address_state: null,
    address_zip: null,
    address_zip_check: null,
    brand: 'Visa',
    country: 'US',
    customer: null,
    exp_month: 12,
    exp_year: 2025,
    fingerprint: 'test_fingerprint',
    funding: 'credit',
    last4: '4242',
  },
  source_transfer: null,
  statement_descriptor: null,
  statement_descriptor_suffix: null,
  status: 'succeeded',
  transfer_data: null,
  transfer_group: null,
};

// Write to file
fs.writeFileSync(mockChargesFile, JSON.stringify([mockCharge], null, 2));

console.log('✅ Mock Stripe charge created successfully!');
console.log(`   File: ${mockChargesFile}`);
console.log(`   Charge ID: ${stripeTransferId}`);
console.log(`   Amount: $264.95`);
console.log(`   Status: succeeded`);
console.log(`   Invoice ID: ${invoiceId}`);
console.log('\n📝 Note: This mock charge file is for local testing only.');
console.log('   In production, charges come directly from the Stripe API.');


