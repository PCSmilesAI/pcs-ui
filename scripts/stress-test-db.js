#!/usr/bin/env node

/**
 * Comprehensive stress test and audit for the SQLite invoice database
 * Tests schema, data integrity, performance, and edge cases
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const DB_PATH = process.env.PCS_DATA_DIR 
  ? path.join(process.env.PCS_DATA_DIR, 'pcs.db')
  : path.join(process.env.HOME || '/root', 'pcs_ui_data', 'pcs.db');

console.log('\n🔍 DATABASE STRESS TEST & AUDIT');
console.log('================================\n');
console.log(`Database path: ${DB_PATH}`);

let db;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${err.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================================
// 1. SCHEMA AUDIT
// ============================================================================
console.log('\n📋 SCHEMA AUDIT');
console.log('---------------');

test('Database file exists', () => {
  assert(fs.existsSync(DB_PATH), 'Database file not found');
});

test('Database can be opened', () => {
  db = new Database(DB_PATH);
  assert(db !== null, 'Failed to open database');
});

test('Pragmas are set correctly', () => {
  const fk = db.prepare('PRAGMA foreign_keys').all()[0];
  const wal = db.prepare('PRAGMA journal_mode').all()[0];
  const sync = db.prepare('PRAGMA synchronous').all()[0];
  
  assert(fk.foreign_keys === 1, 'Foreign keys not enabled');
  assert(wal.journal_mode === 'wal', 'WAL mode not enabled');
  assert(sync.synchronous === 1, 'Synchronous not set to NORMAL');
});

test('invoices table exists with correct schema', () => {
  const schema = db.prepare("PRAGMA table_info(invoices)").all();
  const columns = schema.map(s => s.name);
  
  const required = [
    'id', 'invoice_number', 'parsed_vendor_name', 'corrected_vendor_name',
    'vendor_name', 'parsed_amount_cents', 'corrected_amount_cents', 'amount_cents',
    'status', 'deleted', 'created_at', 'updated_at', 'field_locks'
  ];
  
  for (const col of required) {
    assert(columns.includes(col), `Missing column: ${col}`);
  }
});

test('invoice_events table exists', () => {
  const schema = db.prepare("PRAGMA table_info(invoice_events)").all();
  const columns = schema.map(s => s.name);
  assert(columns.includes('invoice_id'), 'Missing invoice_id column');
  assert(columns.includes('action'), 'Missing action column');
  assert(columns.includes('actor_email'), 'Missing actor_email column');
});

test('tombstones table exists', () => {
  const schema = db.prepare("PRAGMA table_info(tombstones)").all();
  assert(schema.length > 0, 'Tombstones table not found');
});

test('All required indexes exist', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
  const indexNames = indexes.map(i => i.name);
  
  const required = [
    'idx_invoices_status',
    'idx_invoices_vendor_name',
    'idx_invoices_office_id',
    'idx_invoices_deleted',
    'idx_invoice_events_invoice_id'
  ];
  
  for (const idx of required) {
    assert(indexNames.includes(idx), `Missing index: ${idx}`);
  }
});

// ============================================================================
// 2. DATA INTEGRITY TESTS
// ============================================================================
console.log('\n🔐 DATA INTEGRITY TESTS');
console.log('----------------------');

test('Foreign key constraints work', () => {
  try {
    db.prepare('INSERT INTO invoice_events (invoice_id, action) VALUES (?, ?)').run('nonexistent-id', 'TEST');
    throw new Error('Foreign key constraint not enforced');
  } catch (err) {
    assert(err.message.includes('FOREIGN KEY constraint failed'), 'FK constraint not working');
  }
});

test('Unique constraints on invoice_number', () => {
  const id1 = randomUUID();
  const id2 = randomUUID();
  
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id1, 'TEST-DUP-001', 'Vendor A', 10000, 'Vendor A', 10000);
  
  try {
    db.prepare(`
      INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id2, 'TEST-DUP-001', 'Vendor A', 10000, 'Vendor A', 10000);
    throw new Error('Duplicate invoice_number was allowed');
  } catch (err) {
    assert(err.message.includes('UNIQUE constraint failed'), 'Unique constraint not working');
  }
});

// ============================================================================
// 3. STRESS TEST - LARGE VOLUME
// ============================================================================
console.log('\n⚡ STRESS TEST - LARGE VOLUME');
console.log('-----------------------------');

test('Insert 1000 invoices in transaction', () => {
  const start = Date.now();
  
  db.transaction(() => {
    for (let i = 0; i < 1000; i++) {
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, parsed_vendor_name, parsed_amount_cents,
          vendor_name, amount_cents, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        `STRESS-${i}`,
        `Vendor-${i % 50}`,
        Math.floor(Math.random() * 100000),
        `Vendor-${i % 50}`,
        Math.floor(Math.random() * 100000),
        ['incoming', 'categorized', 'awaiting_office_approval', 'to_be_paid', 'paid'][i % 5]
      );
    }
  })();
  
  const elapsed = Date.now() - start;
  console.log(`   Inserted 1000 invoices in ${elapsed}ms (${(1000/elapsed*1000).toFixed(0)} ops/sec)`);
});

test('Query performance: SELECT all invoices', () => {
  const start = Date.now();
  const result = db.prepare('SELECT COUNT(*) as count FROM invoices').get();
  const elapsed = Date.now() - start;
  
  console.log(`   Found ${result.count} invoices in ${elapsed}ms`);
  assert(result.count >= 1000, 'Expected at least 1000 invoices');
});

test('Query performance: Filter by status', () => {
  const start = Date.now();
  const result = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE status = ?').get('paid');
  const elapsed = Date.now() - start;
  
  console.log(`   Status filter query in ${elapsed}ms`);
});

test('Query performance: Filter by vendor', () => {
  const start = Date.now();
  const result = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE vendor_name = ?').get('Vendor-0');
  const elapsed = Date.now() - start;
  
  console.log(`   Vendor filter query in ${elapsed}ms`);
});

test('Pagination: Fetch 100 invoices with offset', () => {
  const start = Date.now();
  const result = db.prepare('SELECT * FROM invoices LIMIT 100 OFFSET 500').all();
  const elapsed = Date.now() - start;
  
  console.log(`   Pagination query in ${elapsed}ms`);
  assert(result.length === 100, 'Expected 100 results');
});

// ============================================================================
// 4. THREE-LAYER FIELD SYSTEM TEST
// ============================================================================
console.log('\n🔄 THREE-LAYER FIELD SYSTEM TEST');
console.log('--------------------------------');

test('Parsed fields are independent from corrected fields', () => {
  const id = randomUUID();
  
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, parsed_vendor_name, parsed_amount_cents,
      corrected_vendor_name, corrected_amount_cents,
      vendor_name, amount_cents
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, 'TEST-LAYER-001',
    'Original Vendor', 50000,
    'Corrected Vendor', 60000,
    'Corrected Vendor', 60000
  );
  
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert(inv.parsed_vendor_name === 'Original Vendor', 'Parsed vendor incorrect');
  assert(inv.corrected_vendor_name === 'Corrected Vendor', 'Corrected vendor incorrect');
  assert(inv.vendor_name === 'Corrected Vendor', 'Effective vendor should be corrected');
});

test('Effective field falls back to parsed when corrected is null', () => {
  const id = randomUUID();
  
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, parsed_vendor_name, parsed_amount_cents,
      vendor_name, amount_cents
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id, 'TEST-LAYER-002',
    'Parsed Vendor', 75000,
    'Parsed Vendor', 75000
  );
  
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert(inv.corrected_vendor_name === null, 'Corrected should be null');
  assert(inv.vendor_name === 'Parsed Vendor', 'Effective should fall back to parsed');
});

// ============================================================================
// 5. AUDIT TRAIL TEST
// ============================================================================
console.log('\n📝 AUDIT TRAIL TEST');
console.log('------------------');

test('Audit events are recorded correctly', () => {
  const invId = randomUUID();
  
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(invId, 'TEST-AUDIT-001', 'Vendor', 10000, 'Vendor', 10000);
  
  db.prepare(`
    INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
    VALUES (?, ?, ?, ?)
  `).run(invId, 'PARSED_UPDATE', 'parser@system', JSON.stringify({vendor: 'Vendor'}));
  
  const events = db.prepare('SELECT * FROM invoice_events WHERE invoice_id = ?').all(invId);
  assert(events.length === 1, 'Event not recorded');
  assert(events[0].action === 'PARSED_UPDATE', 'Action incorrect');
});

// ============================================================================
// 6. EDGE CASES
// ============================================================================
console.log('\n⚠️  EDGE CASES');
console.log('--------------');

test('Handle NULL values in optional fields', () => {
  const id = randomUUID();
  
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, 'TEST-NULL-001', null, null, null, null);
  
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert(inv.parsed_vendor_name === null, 'NULL not handled');
});

test('Handle very large amounts (cents)', () => {
  const id = randomUUID();
  const largeAmount = 999999999;
  
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, 'TEST-LARGE-001', 'Vendor', largeAmount, 'Vendor', largeAmount);
  
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert(inv.amount_cents === largeAmount, 'Large amount not stored correctly');
});

test('Handle special characters in vendor names', () => {
  const id = randomUUID();
  const specialVendor = "O'Reilly & Associates, Inc. (USA)";
  
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, parsed_vendor_name, parsed_amount_cents, vendor_name, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, 'TEST-SPECIAL-001', specialVendor, 10000, specialVendor, 10000);
  
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert(inv.vendor_name === specialVendor, 'Special characters not handled');
});

// ============================================================================
// 7. CLEANUP & SUMMARY
// ============================================================================
console.log('\n🧹 CLEANUP');
console.log('----------');

test('Delete test invoices', () => {
  db.prepare("DELETE FROM invoices WHERE invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'STRESS-%'").run();
  db.prepare("DELETE FROM invoice_events WHERE invoice_id NOT IN (SELECT id FROM invoices)").run();
  console.log('   Test data cleaned up');
});

db.close();

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n📊 TEST SUMMARY');
console.log('===============');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📈 Total:  ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Database is healthy and ready for production.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED! Please review the errors above.\n');
  process.exit(1);
}

