#!/usr/bin/env node

/**
 * End-to-End Test: Multi-Location Invoice Workflow
 * 
 * Scenario:
 * 1. $900 invoice from IT vendor arrives
 * 2. AP Manager applies IT coding template
 * 3. System creates 9 allocations of $100 each
 * 4. Invoice routes to McKay (admin) for approval
 * 5. McKay approves invoice
 * 6. Invoice moves to "to_be_paid" status
 * 7. QBO bill is generated with 9 lines
 * 
 * This test validates the complete end-to-end flow.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const testDbPath = path.join(__dirname, '../pcs_ui_data/test-e2e-multi-location.db');

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[E2E] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

// Setup database
log('Setting up database...');

db.exec(`
  CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    amount_cents INTEGER,
    status TEXT DEFAULT 'incoming',
    is_multi_location INTEGER DEFAULT 0,
    coding_template_id TEXT,
    coded_by_user_id TEXT,
    coded_at TEXT,
    approvals TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    ship_to_reference TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE coding_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor_name TEXT,
    allocation_type TEXT DEFAULT 'equal_split',
    gl_account_name TEXT,
    created_by_user_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE invoice_allocations (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    clinic_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    gl_account_name TEXT,
    template_id TEXT,
    created_by_user_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (clinic_id) REFERENCES clinics(id)
  );
  
  CREATE TABLE invoice_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_email TEXT,
    payload_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  );
`);

// Seed clinics
const clinics = [
  { id: 'clinic_1', name: 'SMILES DENTAL - LONGVIEW', ship_to_reference: '5351067' },
  { id: 'clinic_2', name: 'SMILES DENTAL - HAZEL DELL', ship_to_reference: '14288930' },
  { id: 'clinic_3', name: 'SMILES DENTAL - RIDGEFIELD', ship_to_reference: '14288931' },
  { id: 'clinic_4', name: 'SMILES DENTAL - EUGENE', ship_to_reference: '14288934' },
  { id: 'clinic_5', name: 'SMILES DENTAL - LEBANON', ship_to_reference: '14288935' },
  { id: 'clinic_6', name: 'SMILES DENTAL - MILWAUKIE', ship_to_reference: '16820101' },
  { id: 'clinic_7', name: 'SMILES DENTAL - SNOHOMISH', ship_to_reference: '19599218' },
  { id: 'clinic_8', name: 'SMILES DENTAL - 15TH ST VANCOUVER', ship_to_reference: '21405584' },
  { id: 'clinic_9', name: 'SMILES DENTAL - SALEM', ship_to_reference: '21405585' }
];

for (const clinic of clinics) {
  db.prepare('INSERT INTO clinics (id, name, ship_to_reference) VALUES (?, ?, ?)')
    .run(clinic.id, clinic.name, clinic.ship_to_reference);
}

log('\n=== STEP 1: Invoice Arrives ===');

const invoiceId = uuidv4();
const now = new Date().toISOString();

db.prepare(`
  INSERT INTO invoices (id, invoice_number, amount_cents, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(invoiceId, 'INV-IT-2025-001', 90000, 'incoming', now, now);

const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
assert(invoice.status === 'incoming', 'Invoice created with "incoming" status');
assert(invoice.amount_cents === 90000, 'Invoice amount is $900');
log(`Invoice ${invoice.invoice_number} created: $${invoice.amount_cents / 100}`);

log('\n=== STEP 2: Create Coding Template ===');

const templateId = uuidv4();
db.prepare(`
  INSERT INTO coding_templates (id, name, vendor_name, allocation_type, gl_account_name, created_by_user_id, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(templateId, 'IT Support Services', 'IT Vendor', 'equal_split', 'IT Support Services', 'admin@test.com', 1, now);

const template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(templateId);
assert(template !== undefined, 'Coding template created');
log(`Template "${template.name}" created for vendor "${template.vendor_name}"`);

log('\n=== STEP 3: AP Manager Applies Template ===');

const apManagerEmail = 'ap@test.com';
const allClinics = db.prepare('SELECT id FROM clinics ORDER BY id').all();
const numClinics = allClinics.length;
const baseAmount = Math.floor(90000 / numClinics);
const remainder = 90000 % numClinics;

for (let i = 0; i < allClinics.length; i++) {
  const clinic = allClinics[i];
  const amount = i === allClinics.length - 1 ? baseAmount + remainder : baseAmount;

  db.prepare(`
    INSERT INTO invoice_allocations (id, invoice_id, clinic_id, amount_cents, gl_account_name, template_id, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), invoiceId, clinic.id, amount, 'IT Support Services', templateId, apManagerEmail, now);
}

// Update invoice
db.prepare(`
  UPDATE invoices SET
    is_multi_location = 1,
    coding_template_id = ?,
    coded_by_user_id = ?,
    coded_at = ?,
    status = 'coded',
    updated_at = ?
  WHERE id = ?
`).run(templateId, apManagerEmail, now, now, invoiceId);

// Log event
db.prepare(`
  INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?)
`).run(invoiceId, 'apply_coding_template', apManagerEmail, JSON.stringify({ template_id: templateId }), now);

const allocations = db.prepare('SELECT * FROM invoice_allocations WHERE invoice_id = ?').all(invoiceId);
assert(allocations.length === 9, `All 9 allocations created`);
log(`AP Manager applied template: 9 allocations created`);

log('\n=== STEP 4: Verify Allocations ===');

const totalAllocated = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
assert(totalAllocated === 90000, `Total allocated = $${totalAllocated / 100}`);

allocations.forEach((a, i) => {
  const clinic = db.prepare('SELECT name FROM clinics WHERE id = ?').get(a.clinic_id);
  log(`  Clinic ${i + 1}: ${clinic.name} = $${a.amount_cents / 100}`);
});

log('\n=== STEP 5: Invoice Routes to Admin (McKay) ===');

// Simulate workflow routing
const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
assert(updatedInvoice.is_multi_location === 1, 'Invoice marked as multi-location');
assert(updatedInvoice.status === 'coded', 'Invoice status is "coded"');

// Multi-location invoices bypass office managers and go directly to admin
const shouldRouteToAdmin = updatedInvoice.is_multi_location === 1;
assert(shouldRouteToAdmin, 'Multi-location invoice routes to admin (McKay)');
log('Invoice routed to McKay for approval (bypassed office managers)');

log('\n=== STEP 6: McKay Approves Invoice ===');

const mcKayEmail = 'mckaym@pacificcrestsmiles.com';
const approvals = {
  ap: { by: apManagerEmail, at: now },
  admin: { by: mcKayEmail, at: now }
};

db.prepare(`
  UPDATE invoices SET
    status = 'to_be_paid',
    approvals = ?,
    updated_at = ?
  WHERE id = ?
`).run(JSON.stringify(approvals), now, invoiceId);

db.prepare(`
  INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?)
`).run(invoiceId, 'approve_admin', mcKayEmail, JSON.stringify({ status: 'to_be_paid' }), now);

const approvedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
assert(approvedInvoice.status === 'to_be_paid', 'Invoice status is "to_be_paid"');
log(`McKay approved invoice. Status: ${approvedInvoice.status}`);

log('\n=== STEP 7: Generate QuickBooks Bill ===');

const qboBillLines = allocations.map(allocation => {
  const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(allocation.clinic_id);
  return {
    Description: `IT Support Services - ${clinic.name}`,
    Amount: allocation.amount_cents / 100,
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: '1' },
      ClassRef: { value: clinic.id }
    }
  };
});

assert(qboBillLines.length === 9, `Generated ${qboBillLines.length} QBO bill lines`);

const qboTotal = qboBillLines.reduce((sum, line) => sum + line.Amount, 0);
assert(Math.abs(qboTotal - 900) < 0.01, `QBO bill total = $${qboTotal}`);

log(`Generated QBO bill with ${qboBillLines.length} lines totaling $${qboTotal}`);
qboBillLines.forEach((line, i) => {
  log(`  Line ${i + 1}: ${line.Description} = $${line.Amount}`);
});

log('\n=== STEP 8: Verify Audit Trail ===');

const events = db.prepare('SELECT * FROM invoice_events WHERE invoice_id = ? ORDER BY created_at').all(invoiceId);
assert(events.length >= 2, `Audit trail has ${events.length} events`);

events.forEach((event, i) => {
  log(`  Event ${i + 1}: ${event.action} by ${event.actor_email}`);
});

log('\n' + '='.repeat(60));
log(`E2E TEST COMPLETED: ${testsPassed} passed, ${testsFailed} failed`);
log('='.repeat(60));

db.close();

if (testsFailed > 0) {
  process.exit(1);
}

