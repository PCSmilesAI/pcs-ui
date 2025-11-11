#!/usr/bin/env node

/**
 * COMPREHENSIVE DATABASE LAYER TEST
 * Tests all database operations, schema integrity, and data consistency
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const TEST_DB_PATH = path.join(__dirname, '../pcs_ui_data/test-db.sqlite');
let testsPassed = 0;
let testsFailed = 0;

// Cleanup before starting
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const db = new Database(TEST_DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

console.log('🔍 COMPREHENSIVE DATABASE LAYER TEST\n');

// ============================================================================
// TEST 1: Schema Creation
// ============================================================================
function testSchemaCreation() {
  console.log('TEST 1: Schema Creation');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        source_file TEXT,
        source_message_id TEXT UNIQUE,
        parsed_vendor_name TEXT,
        parsed_office_id TEXT,
        parsed_amount_cents INTEGER,
        corrected_vendor_name TEXT,
        corrected_office_id TEXT,
        corrected_amount_cents INTEGER,
        vendor_name TEXT,
        office_id TEXT,
        amount_cents INTEGER,
        field_locks TEXT,
        status TEXT DEFAULT 'incoming',
        approvals TEXT,
        deleted INTEGER DEFAULT 0,
        workflow_deleted_at TEXT,
        status_version INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
        UNIQUE(source_message_id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_email TEXT,
        actor_name TEXT,
        payload_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tombstones (
        source_message_id TEXT PRIMARY KEY,
        deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_vendor_name ON invoices(vendor_name);
      CREATE INDEX IF NOT EXISTS idx_invoices_office_id ON invoices(office_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted);
      CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice_id ON invoice_events(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_events_created_at ON invoice_events(created_at);
    `);

    console.log('  ✅ Schema created successfully\n');
    testsPassed++;
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 2: Insert Invoice with All Fields
// ============================================================================
function testInsertInvoice() {
  console.log('TEST 2: Insert Invoice with All Fields');
  try {
    const invoiceId = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, source_message_id,
        parsed_vendor_name, parsed_office_id, parsed_amount_cents,
        vendor_name, office_id, amount_cents,
        status, invoice_date, due_date, description,
        category, clinic_id, office_location, vendor_id, pdf_path, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      invoiceId,
      'INV-001',
      'test.pdf',
      'msg_001',
      'Henry Schein',
      'office_1',
      50000,
      'Henry Schein',
      'office_1',
      50000,
      'incoming',
      '2025-11-11',
      '2025-12-11',
      'Test invoice',
      'supplies',
      'clinic_1',
      'Main Office',
      'vendor_1',
      '/path/to/test.pdf',
      500.00
    );

    const result = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (result && result.invoice_number === 'INV-001') {
      console.log('  ✅ Invoice inserted successfully\n');
      testsPassed++;
    } else {
      throw new Error('Invoice not found after insert');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 3: Unique Constraint on invoice_number
// ============================================================================
function testUniqueConstraint() {
  console.log('TEST 3: Unique Constraint on invoice_number');
  try {
    const stmt = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, source_message_id,
        parsed_vendor_name, parsed_office_id, parsed_amount_cents,
        vendor_name, office_id, amount_cents, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Try to insert duplicate invoice_number
    try {
      stmt.run(
        randomUUID(), 'INV-001', 'test2.pdf', 'msg_002',
        'Henry Schein', 'office_1', 50000,
        'Henry Schein', 'office_1', 50000, 'incoming'
      );
      throw new Error('Should have failed with unique constraint violation');
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        console.log('  ✅ Unique constraint enforced correctly\n');
        testsPassed++;
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 4: Audit Trail (invoice_events)
// ============================================================================
function testAuditTrail() {
  console.log('TEST 4: Audit Trail (invoice_events)');
  try {
    const invoiceId = randomUUID();
    
    // Insert invoice
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, source_message_id,
        parsed_vendor_name, parsed_office_id, parsed_amount_cents,
        vendor_name, office_id, amount_cents, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId, 'INV-AUDIT-001', 'test.pdf', 'msg_audit_001',
      'Henry Schein', 'office_1', 50000,
      'Henry Schein', 'office_1', 50000, 'incoming'
    );

    // Add audit event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, actor_email, actor_name, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      invoiceId,
      'CORRECTED',
      'user@example.com',
      'Test User',
      JSON.stringify({ field: 'vendor_name', old: 'Henry Schein', new: 'Henry Schein Inc' })
    );

    const events = db.prepare('SELECT * FROM invoice_events WHERE invoice_id = ?').all(invoiceId);
    if (events.length === 1 && events[0].action === 'CORRECTED') {
      console.log('  ✅ Audit trail working correctly\n');
      testsPassed++;
    } else {
      throw new Error('Audit event not found');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 5: Tombstone System
// ============================================================================
function testTombstoneSystem() {
  console.log('TEST 5: Tombstone System');
  try {
    const messageId = 'msg_tombstone_001';

    // Add tombstone
    db.prepare('INSERT INTO tombstones (source_message_id) VALUES (?)').run(messageId);

    // Verify tombstone exists
    const tombstone = db.prepare('SELECT * FROM tombstones WHERE source_message_id = ?').get(messageId);

    if (tombstone && tombstone.source_message_id === messageId) {
      console.log('  ✅ Tombstone system working correctly\n');
      testsPassed++;
    } else {
      throw new Error('Tombstone not created');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 6: Foreign Key Constraint
// ============================================================================
function testForeignKeyConstraint() {
  console.log('TEST 6: Foreign Key Constraint');
  try {
    // Try to insert event with non-existent invoice_id
    try {
      db.prepare(`
        INSERT INTO invoice_events (invoice_id, action, actor_email, actor_name, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'non_existent_id',
        'CORRECTED',
        'user@example.com',
        'Test User',
        '{}'
      );
      throw new Error('Should have failed with foreign key constraint');
    } catch (err) {
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        console.log('  ✅ Foreign key constraint enforced\n');
        testsPassed++;
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 7: Corrected vs Parsed Fields
// ============================================================================
function testCorrectedVsParsedFields() {
  console.log('TEST 7: Corrected vs Parsed Fields');
  try {
    const invoiceId = randomUUID();
    
    // Insert with parsed values
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, source_message_id,
        parsed_vendor_name, parsed_office_id, parsed_amount_cents,
        corrected_vendor_name, corrected_office_id, corrected_amount_cents,
        vendor_name, office_id, amount_cents, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId, 'INV-CORRECTED-001', 'test.pdf', 'msg_corrected_001',
      'Henry Schein', 'office_1', 50000,
      'Henry Schein Inc', 'office_2', 55000,
      'Henry Schein Inc', 'office_2', 55000,
      'incoming'
    );

    const result = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (result.vendor_name === 'Henry Schein Inc' && result.parsed_vendor_name === 'Henry Schein') {
      console.log('  ✅ Corrected and parsed fields working correctly\n');
      testsPassed++;
    } else {
      throw new Error('Fields not set correctly');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 8: Query Performance with Indexes
// ============================================================================
function testQueryPerformance() {
  console.log('TEST 8: Query Performance with Indexes');
  try {
    // Insert 100 test invoices
    const stmt = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, source_message_id,
        parsed_vendor_name, parsed_office_id, parsed_amount_cents,
        vendor_name, office_id, amount_cents, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 100; i++) {
      stmt.run(
        randomUUID(),
        `INV-PERF-${i}`,
        `test_${i}.pdf`,
        `msg_perf_${i}`,
        'Henry Schein',
        'office_1',
        50000,
        'Henry Schein',
        'office_1',
        50000,
        'incoming'
      );
    }

    // Test indexed query
    const start = Date.now();
    const results = db.prepare('SELECT * FROM invoices WHERE status = ?').all('incoming');
    const duration = Date.now() - start;

    if (results.length > 0 && duration < 100) {
      console.log(`  ✅ Query performance good (${duration}ms for ${results.length} rows)\n`);
      testsPassed++;
    } else {
      throw new Error(`Query too slow: ${duration}ms`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
testSchemaCreation();
testInsertInvoice();
testUniqueConstraint();
testAuditTrail();
testTombstoneSystem();
testForeignKeyConstraint();
testCorrectedVsParsedFields();
testQueryPerformance();

// Cleanup
db.close();
fs.unlinkSync(TEST_DB_PATH);

// Summary
console.log('═'.repeat(60));
console.log(`RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log('═'.repeat(60));

process.exit(testsFailed > 0 ? 1 : 0);

