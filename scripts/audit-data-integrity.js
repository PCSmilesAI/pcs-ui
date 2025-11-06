#!/usr/bin/env node

/**
 * Comprehensive data integrity and consistency audit
 * Checks for orphaned records, constraint violations, and data anomalies
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.PCS_DATA_DIR 
  ? path.join(process.env.PCS_DATA_DIR, 'pcs.db')
  : path.join(process.env.HOME || '/root', 'pcs_ui_data', 'pcs.db');

console.log('\n🔐 DATA INTEGRITY & CONSISTENCY AUDIT');
console.log('=====================================\n');

const db = new Database(DB_PATH);
let issuesFound = 0;
let warningsFound = 0;

function issue(msg) {
  console.error(`❌ ISSUE: ${msg}`);
  issuesFound++;
}

function warning(msg) {
  console.warn(`⚠️  WARNING: ${msg}`);
  warningsFound++;
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

// ============================================================================
// 1. ORPHANED RECORDS
// ============================================================================
console.log('🔍 CHECKING FOR ORPHANED RECORDS');
console.log('--------------------------------');

const orphanedEvents = db.prepare(`
  SELECT COUNT(*) as count FROM invoice_events 
  WHERE invoice_id NOT IN (SELECT id FROM invoices)
`).get();

if (orphanedEvents.count > 0) {
  issue(`Found ${orphanedEvents.count} orphaned invoice_events records`);
} else {
  console.log('✅ No orphaned invoice_events');
}

// ============================================================================
// 2. CONSTRAINT VIOLATIONS
// ============================================================================
console.log('\n🔒 CHECKING CONSTRAINT VIOLATIONS');
console.log('--------------------------------');

const duplicateInvoiceNumbers = db.prepare(`
  SELECT invoice_number, COUNT(*) as count FROM invoices 
  GROUP BY invoice_number HAVING count > 1
`).all();

if (duplicateInvoiceNumbers.length > 0) {
  issue(`Found ${duplicateInvoiceNumbers.length} duplicate invoice_numbers`);
  duplicateInvoiceNumbers.forEach(dup => {
    console.error(`   - ${dup.invoice_number}: ${dup.count} occurrences`);
  });
} else {
  console.log('✅ No duplicate invoice_numbers');
}

const duplicateSourceMessages = db.prepare(`
  SELECT source_message_id, COUNT(*) as count FROM invoices 
  WHERE source_message_id IS NOT NULL
  GROUP BY source_message_id HAVING count > 1
`).all();

if (duplicateSourceMessages.length > 0) {
  issue(`Found ${duplicateSourceMessages.length} duplicate source_message_ids`);
} else {
  console.log('✅ No duplicate source_message_ids');
}

// ============================================================================
// 3. THREE-LAYER FIELD CONSISTENCY
// ============================================================================
console.log('\n🔄 CHECKING THREE-LAYER FIELD CONSISTENCY');
console.log('----------------------------------------');

const inconsistentEffective = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE (
    (corrected_vendor_name IS NOT NULL AND vendor_name != corrected_vendor_name) OR
    (corrected_vendor_name IS NULL AND parsed_vendor_name IS NOT NULL AND vendor_name != parsed_vendor_name) OR
    (corrected_amount_cents IS NOT NULL AND amount_cents != corrected_amount_cents) OR
    (corrected_amount_cents IS NULL AND parsed_amount_cents IS NOT NULL AND amount_cents != parsed_amount_cents)
  )
`).get();

if (inconsistentEffective.count > 0) {
  issue(`Found ${inconsistentEffective.count} invoices with inconsistent effective fields`);
} else {
  console.log('✅ All effective fields are consistent');
}

// ============================================================================
// 4. FIELD LOCKS VALIDATION
// ============================================================================
console.log('\n🔐 CHECKING FIELD LOCKS');
console.log('----------------------');

const invoicesWithLocks = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE field_locks IS NOT NULL
`).get();

info(`${invoicesWithLocks.count} invoices have field locks`);

// Validate field_locks JSON
const lockedInvoices = db.prepare(`
  SELECT id, field_locks FROM invoices WHERE field_locks IS NOT NULL LIMIT 100
`).all();

let invalidLocks = 0;
for (const inv of lockedInvoices) {
  try {
    JSON.parse(inv.field_locks);
  } catch {
    issue(`Invoice ${inv.id} has invalid field_locks JSON`);
    invalidLocks++;
  }
}

if (invalidLocks === 0 && lockedInvoices.length > 0) {
  console.log('✅ All field_locks are valid JSON');
}

// ============================================================================
// 5. APPROVALS JSON VALIDATION
// ============================================================================
console.log('\n✅ CHECKING APPROVALS JSON');
console.log('-------------------------');

const invoicesWithApprovals = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE approvals IS NOT NULL
`).get();

info(`${invoicesWithApprovals.count} invoices have approvals`);

const approvalsInvoices = db.prepare(`
  SELECT id, approvals FROM invoices WHERE approvals IS NOT NULL LIMIT 100
`).all();

let invalidApprovals = 0;
for (const inv of approvalsInvoices) {
  try {
    JSON.parse(inv.approvals);
  } catch {
    issue(`Invoice ${inv.id} has invalid approvals JSON`);
    invalidApprovals++;
  }
}

if (invalidApprovals === 0 && approvalsInvoices.length > 0) {
  console.log('✅ All approvals are valid JSON');
}

// ============================================================================
// 6. STATUS VALIDITY
// ============================================================================
console.log('\n📊 CHECKING STATUS VALIDITY');
console.log('---------------------------');

const validStatuses = [
  'incoming', 'categorized', 'awaiting_office_approval',
  'awaiting_admin_approval', 'to_be_paid', 'paid', 'rejected', 'repair', 'removed',
  'pending'  // Legacy status from old data
];

const invalidStatuses = db.prepare(`
  SELECT DISTINCT status FROM invoices WHERE status NOT IN (${validStatuses.map(() => '?').join(',')})
`).all(...validStatuses);

if (invalidStatuses.length > 0) {
  issue(`Found ${invalidStatuses.length} invalid status values`);
  invalidStatuses.forEach(s => console.error(`   - ${s.status}`));
} else {
  console.log('✅ All invoice statuses are valid');
}

// ============================================================================
// 7. AMOUNT VALIDATION
// ============================================================================
console.log('\n💰 CHECKING AMOUNT VALIDITY');
console.log('---------------------------');

const negativeAmounts = db.prepare(`
  SELECT COUNT(*) as count FROM invoices 
  WHERE (parsed_amount_cents < 0 OR corrected_amount_cents < 0 OR amount_cents < 0)
`).get();

if (negativeAmounts.count > 0) {
  issue(`Found ${negativeAmounts.count} invoices with negative amounts`);
} else {
  console.log('✅ No negative amounts found');
}

const zeroAmounts = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE amount_cents = 0
`).get();

if (zeroAmounts.count > 0) {
  warning(`Found ${zeroAmounts.count} invoices with zero amount`);
}

// ============================================================================
// 8. TIMESTAMP VALIDATION
// ============================================================================
console.log('\n⏰ CHECKING TIMESTAMPS');
console.log('---------------------');

const invalidCreatedAt = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE created_at IS NULL
`).get();

if (invalidCreatedAt.count > 0) {
  issue(`Found ${invalidCreatedAt.count} invoices with NULL created_at`);
} else {
  console.log('✅ All invoices have created_at timestamp');
}

const futureTimestamps = db.prepare(`
  SELECT COUNT(*) as count FROM invoices 
  WHERE datetime(created_at) > datetime('now')
`).get();

if (futureTimestamps.count > 0) {
  warning(`Found ${futureTimestamps.count} invoices with future timestamps`);
}

// ============================================================================
// 9. AUDIT TRAIL COMPLETENESS
// ============================================================================
console.log('\n📝 CHECKING AUDIT TRAIL');
console.log('---------------------');

const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get();
const invoicesWithEvents = db.prepare(`
  SELECT COUNT(DISTINCT invoice_id) as count FROM invoice_events
`).get();

info(`Total invoices: ${totalInvoices.count}`);
info(`Invoices with audit events: ${invoicesWithEvents.count}`);

if (invoicesWithEvents.count < totalInvoices.count) {
  warning(`${totalInvoices.count - invoicesWithEvents.count} invoices have no audit trail`);
}

// ============================================================================
// 10. DELETED RECORDS
// ============================================================================
console.log('\n🗑️  CHECKING DELETED RECORDS');
console.log('---------------------------');

const deletedInvoices = db.prepare(`
  SELECT COUNT(*) as count FROM invoices WHERE deleted = 1
`).get();

info(`${deletedInvoices.count} invoices marked as deleted`);

const deletedWithoutEvents = db.prepare(`
  SELECT COUNT(*) as count FROM invoices 
  WHERE deleted = 1 AND id NOT IN (SELECT DISTINCT invoice_id FROM invoice_events)
`).get();

if (deletedWithoutEvents.count > 0) {
  warning(`${deletedWithoutEvents.count} deleted invoices have no audit trail`);
}

// ============================================================================
// 11. TOMBSTONE RECORDS
// ============================================================================
console.log('\n⚰️  CHECKING TOMBSTONES');
console.log('---------------------');

const tombstoneCount = db.prepare('SELECT COUNT(*) as count FROM tombstones').get();
info(`${tombstoneCount.count} tombstone records`);

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n📊 AUDIT SUMMARY');
console.log('===============');
console.log(`❌ Issues found: ${issuesFound}`);
console.log(`⚠️  Warnings: ${warningsFound}`);

if (issuesFound === 0) {
  console.log('\n✅ DATA INTEGRITY CHECK PASSED - No issues found!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  DATA INTEGRITY ISSUES DETECTED - Please review above!\n');
  process.exit(1);
}

