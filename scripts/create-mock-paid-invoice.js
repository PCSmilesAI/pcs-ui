#!/usr/bin/env node

/**
 * Script to create a mock paid invoice for testing the payment receipt feature
 * Usage: node scripts/create-mock-paid-invoice.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Resolve data directory
const dataDir = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pcs.db');
console.log(`[MOCK] Opening database at: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize database tables if they don't exist
console.log('[MOCK] Initializing database tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    source_file TEXT,
    source_message_id TEXT UNIQUE,

    -- Parsed fields (from parser/ingester)
    parsed_vendor_name TEXT,
    parsed_office_id TEXT,
    parsed_amount_cents INTEGER,

    -- Corrected fields (from user edits)
    corrected_vendor_name TEXT,
    corrected_office_id TEXT,
    corrected_amount_cents INTEGER,

    -- Effective fields (materialized: corrected OR parsed)
    vendor_name TEXT,
    office_id TEXT,
    amount_cents INTEGER,

    -- Field locks (JSON: { "vendor_name": true, ... })
    field_locks TEXT,

    -- Workflow fields
    status TEXT DEFAULT 'incoming',
    approvals TEXT,  -- JSON: { ap: {...}, office: {...}, admin: {...}, ... }

    -- Metadata
    deleted INTEGER DEFAULT 0,
    workflow_deleted_at TEXT,
    status_version INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

    -- Additional fields from original invoice
    invoice_date TEXT,
    due_date TEXT,
    description TEXT,
    category TEXT,
    clinic_id TEXT,
    office_location TEXT,
    vendor_id TEXT,
    pdf_path TEXT,
    total REAL,
    invoice_total REAL,

    -- Payment fields
    paid_at TEXT,
    paid_by TEXT,
    stripe_transfer_id TEXT,

    UNIQUE(source_message_id)
  );
`);

try {
  // Generate IDs
  const invoiceId = `mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const invoiceNumber = `MOCK-${Date.now()}`;
  const stripeTransferId = `tr_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Create a mock paid invoice
  const now = new Date().toISOString();
  const paidDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

  const stmt = db.prepare(`
    INSERT INTO invoices (
      id,
      invoice_number,
      vendor_name,
      office_id,
      amount_cents,
      status,
      invoice_date,
      due_date,
      description,
      total,
      invoice_total,
      pdf_path,
      created_at,
      updated_at,
      paid_at,
      paid_by,
      stripe_transfer_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const amountCents = 26495; // $264.95
  const amountDollars = amountCents / 100;

  stmt.run(
    invoiceId,
    invoiceNumber,
    'Pacific Crest Smiles', // vendor name
    'Milwaukie', // office
    amountCents,
    'paid', // status
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
    'Mock Invoice for Testing Payment Receipt',
    amountDollars,
    amountDollars,
    '/pdfs/mock-invoice.pdf',
    now,
    now,
    paidDate,
    'business@pcsmilesai.com',
    stripeTransferId
  );

  console.log('✅ Mock paid invoice created successfully!');
  console.log(`   Invoice ID: ${invoiceId}`);
  console.log(`   Invoice Number: ${invoiceNumber}`);
  console.log(`   Amount: $${amountDollars.toFixed(2)}`);
  console.log(`   Status: paid`);
  console.log(`   Stripe Transfer ID: ${stripeTransferId}`);
  console.log(`   Paid At: ${paidDate}`);
  console.log(`   Paid By: business@pcsmilesai.com`);
  console.log('\n📝 Note: This invoice should now appear in the "Complete" tab');
  console.log('   and show the payment details with a Receipt link.');

} catch (error) {
  console.error('❌ Error creating mock invoice:', error.message);
  process.exit(1);
} finally {
  db.close();
}

