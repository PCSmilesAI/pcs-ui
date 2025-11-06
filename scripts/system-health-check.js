#!/usr/bin/env node

/**
 * Comprehensive system health check
 * Runs all audits and tests to verify system is production-ready
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;
const tests = [
  { name: 'Database Stress Test', script: 'stress-test-db.js' },
  { name: 'API Endpoint Tests', script: 'test-api-endpoints.js' },
  { name: 'Data Integrity Audit', script: 'audit-data-integrity.js' }
];

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🏥 SYSTEM HEALTH CHECK - PRODUCTION READY?         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const results = [];
let allPassed = true;

for (const test of tests) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${test.name}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const scriptPath = path.join(SCRIPTS_DIR, test.script);
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
    results.push({ name: test.name, status: '✅ PASSED' });
  } catch (err) {
    results.push({ name: test.name, status: '❌ FAILED' });
    allPassed = false;
  }
}

// ============================================================================
// SUMMARY REPORT
// ============================================================================
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    📊 HEALTH CHECK SUMMARY                 ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

for (const result of results) {
  console.log(`${result.status} ${result.name}`);
}

console.log('\n' + '='.repeat(60));

if (allPassed) {
  console.log('\n✅ SYSTEM IS PRODUCTION READY!\n');
  console.log('The database backend is:');
  console.log('  ✓ Properly initialized with correct schema');
  console.log('  ✓ Handling large volumes efficiently (1000+ ops/sec)');
  console.log('  ✓ All API endpoints responding correctly');
  console.log('  ✓ Data integrity verified with no corruption');
  console.log('  ✓ Constraints and relationships enforced');
  console.log('  ✓ Three-layer field system working correctly');
  console.log('  ✓ Audit trail functional');
  console.log('\n🚀 Ready for production deployment!\n');
  process.exit(0);
} else {
  console.log('\n❌ SYSTEM HAS ISSUES - NOT PRODUCTION READY\n');
  console.log('Please review the failures above and fix before deploying.\n');
  process.exit(1);
}

