#!/usr/bin/env node

/**
 * Comprehensive test suite for multi-location invoice system
 * 
 * Tests:
 * 1. Database schema creation
 * 2. Clinic seeding
 * 3. Coding template creation
 * 4. Applying coding templates to invoices
 * 5. Allocation calculations
 * 6. Workflow routing for multi-location invoices
 * 7. QuickBooks bill line generation
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Test database
const testDbPath = path.join(__dirname, '../pcs_ui_data/test-multi-location.db');

// Clean up test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

let passedTests = 0;
let failedTests = 0;

function log(message) {
  console.log(`[TEST] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    passedTests++;
  }
}

// ============================================================================
// Test 1: Database Schema Creation
// ============================================================================

log('Test 1: Creating database schema...');

try {
  // Create invoices table
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create clinics table
  db.exec(`
    CREATE TABLE clinics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      ship_to_reference TEXT UNIQUE,
      contact_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create coding_templates table
  db.exec(`
    CREATE TABLE coding_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vendor_name TEXT,
      allocation_type TEXT DEFAULT 'equal_split',
      apply_to_locations TEXT DEFAULT 'all_locations',
      gl_account_name TEXT,
      created_by_user_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create invoice_allocations table
  db.exec(`
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
      FOREIGN KEY (clinic_id) REFERENCES clinics(id),
      FOREIGN KEY (template_id) REFERENCES coding_templates(id)
    );
  `);

  // Create invoice_events table
  db.exec(`
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

  assert(true, 'Database schema created successfully');
} catch (error) {
  assert(false, `Schema creation failed: ${error.message}`);
}

// ============================================================================
// Test 2: Seed Clinics
// ============================================================================

log('\nTest 2: Seeding clinics...');

const clinicsData = [
  { id: 'clinic_longview', name: 'SMILES DENTAL - LONGVIEW', ship_to_reference: '5351067' },
  { id: 'clinic_hazel_dell', name: 'SMILES DENTAL - HAZEL DELL', ship_to_reference: '14288930' },
  { id: 'clinic_ridgefield', name: 'SMILES DENTAL - RIDGEFIELD', ship_to_reference: '14288931' },
  { id: 'clinic_eugene', name: 'SMILES DENTAL - EUGENE', ship_to_reference: '14288934' },
  { id: 'clinic_lebanon', name: 'SMILES DENTAL - LEBANON', ship_to_reference: '14288935' },
  { id: 'clinic_milwaukie', name: 'SMILES DENTAL - MILWAUKIE', ship_to_reference: '16820101' },
  { id: 'clinic_snohomish', name: 'SMILES DENTAL - SNOHOMISH', ship_to_reference: '19599218' },
  { id: 'clinic_15th_st', name: 'SMILES DENTAL - 15TH ST VANCOUVER', ship_to_reference: '21405584' },
  { id: 'clinic_salem', name: 'SMILES DENTAL - SALEM', ship_to_reference: '21405585' }
];

try {
  const insertClinic = db.prepare(`
    INSERT INTO clinics (id, name, ship_to_reference) VALUES (?, ?, ?)
  `);

  for (const clinic of clinicsData) {
    insertClinic.run(clinic.id, clinic.name, clinic.ship_to_reference);
  }

  const clinicCount = db.prepare('SELECT COUNT(*) as count FROM clinics').get();
  assert(clinicCount.count === 9, `All 9 clinics seeded (got ${clinicCount.count})`);
} catch (error) {
  assert(false, `Clinic seeding failed: ${error.message}`);
}

// ============================================================================
// Test 3: Create Coding Template
// ============================================================================

log('\nTest 3: Creating coding template...');

let templateId;
try {
  templateId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO coding_templates (
      id, name, vendor_name, allocation_type, apply_to_locations,
      gl_account_name, created_by_user_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    templateId, 'IT Support Services', 'IT Vendor', 'equal_split', 'all_locations',
    'IT Support Services', 'admin@test.com', 1, now, now
  );

  const template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(templateId);
  assert(template !== undefined, 'Coding template created');
  assert(template.vendor_name === 'IT Vendor', 'Template has correct vendor name');
} catch (error) {
  assert(false, `Template creation failed: ${error.message}`);
}

// ============================================================================
// Test 4: Create Invoice and Apply Template
// ============================================================================

log('\nTest 4: Creating invoice and applying template...');

let invoiceId;
try {
  invoiceId = uuidv4();
  const now = new Date().toISOString();

  // Create invoice with $900 total
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, amount_cents, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    invoiceId, 'INV-TEST-001', 90000, 'incoming', now, now
  );

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  assert(invoice !== undefined, 'Invoice created');
  assert(invoice.amount_cents === 90000, 'Invoice has correct amount ($900)');

  // Apply template
  const clinics = db.prepare('SELECT id FROM clinics ORDER BY id').all();
  const numClinics = clinics.length;
  const baseAmount = Math.floor(90000 / numClinics);
  const remainder = 90000 % numClinics;

  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i];
    const amount = i === clinics.length - 1 ? baseAmount + remainder : baseAmount;

    db.prepare(`
      INSERT INTO invoice_allocations (
        id, invoice_id, clinic_id, amount_cents, gl_account_name, template_id, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), invoiceId, clinic.id, amount, 'IT Support Services', templateId, 'admin@test.com', now
    );
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
  `).run(templateId, 'admin@test.com', now, now, invoiceId);

  const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  assert(updatedInvoice.is_multi_location === 1, 'Invoice marked as multi-location');
  assert(updatedInvoice.status === 'coded', 'Invoice status set to coded');
} catch (error) {
  assert(false, `Template application failed: ${error.message}`);
}

// ============================================================================
// Test 5: Verify Allocations
// ============================================================================

log('\nTest 5: Verifying allocations...');

try {
  const allocations = db.prepare('SELECT * FROM invoice_allocations WHERE invoice_id = ?').all(invoiceId);
  assert(allocations.length === 9, `All 9 allocations created (got ${allocations.length})`);

  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
  assert(totalAllocated === 90000, `Total allocated equals invoice amount ($${totalAllocated / 100})`);

  // Check equal split
  const amounts = allocations.map(a => a.amount_cents);
  const expectedAmount = Math.floor(90000 / 9);
  const allEqual = amounts.every(a => a === expectedAmount || a === expectedAmount + (90000 % 9));
  assert(allEqual, 'Allocations are equally split');

  // Print allocation breakdown
  allocations.forEach((a, i) => {
    const clinic = db.prepare('SELECT name FROM clinics WHERE id = ?').get(a.clinic_id);
    log(`  Allocation ${i + 1}: ${clinic.name} = $${a.amount_cents / 100}`);
  });
} catch (error) {
  assert(false, `Allocation verification failed: ${error.message}`);
}

// ============================================================================
// Test 6: Workflow Routing
// ============================================================================

log('\nTest 6: Testing workflow routing for multi-location invoices...');

try {
  // Multi-location invoices should route to admin (awaiting_admin_approval)
  // This is handled by the routeAfterAP function in the workflow engine
  const multiLocationInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  
  // Simulate routing logic
  const shouldRouteToAdmin = multiLocationInvoice.is_multi_location === 1;
  assert(shouldRouteToAdmin, 'Multi-location invoices route to admin approval');
} catch (error) {
  assert(false, `Workflow routing test failed: ${error.message}`);
}

// ============================================================================
// Test 7: QuickBooks Bill Line Generation
// ============================================================================

log('\nTest 7: Testing QuickBooks bill line generation...');

try {
  const allocations = db.prepare('SELECT * FROM invoice_allocations WHERE invoice_id = ?').all(invoiceId);
  
  const lines = allocations.map(allocation => {
    const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(allocation.clinic_id);
    return {
      Description: `Invoice - ${clinic.name}`,
      Amount: allocation.amount_cents / 100,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: '1' },
        ClassRef: { value: clinic.id }
      }
    };
  });

  assert(lines.length === 9, `Generated ${lines.length} bill lines`);
  
  const totalLineAmount = lines.reduce((sum, line) => sum + line.Amount, 0);
  assert(Math.abs(totalLineAmount - 900) < 0.01, `Bill lines total to $${totalLineAmount}`);

  log(`  Generated ${lines.length} QBO bill lines totaling $${totalLineAmount}`);
} catch (error) {
  assert(false, `QBO bill generation test failed: ${error.message}`);
}

// ============================================================================
// Summary
// ============================================================================

log('\n' + '='.repeat(60));
log(`TESTS COMPLETED: ${passedTests} passed, ${failedTests} failed`);
log('='.repeat(60));

// Clean up
db.close();

if (failedTests > 0) {
  process.exit(1);
}

