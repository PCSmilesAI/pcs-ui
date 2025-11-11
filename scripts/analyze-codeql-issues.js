#!/usr/bin/env node

/**
 * Analyze CodeQL issues and identify which endpoints need fixing
 * Based on the 42 remaining CodeQL issues
 */

const fs = require('fs');
const path = require('path');

const issues = {
  'Uncontrolled data in path expression': [
    'app/api/pdf/[filename]/route.ts',
    'app/output_jsons/[...file]/route.ts',
    'app/api/repair-invoice/route.ts',
    'app/api/invoices/[id]/route.ts',
    'app/api/qbo/*/route.ts',
    'app/api/vendors/*/route.ts'
  ],
  'Incomplete string escaping or encoding': [
    'app/api/pdf/[filename]/route.ts',
    'app/api/repair-invoice/route.ts',
    'app/api/invoices/*/route.ts',
    'app/api/qbo/*/route.ts'
  ],
  'Type confusion through parameter tampering': [
    'app/api/invoices/*/route.ts',
    'app/api/qbo/*/route.ts',
    'app/api/vendors/*/route.ts',
    'app/api/stripe/*/route.ts'
  ],
  'Client-side cross-site scripting': [
    'src/components/*.jsx',
    'src/pages/*.jsx',
    'src/app/**/*.tsx'
  ],
  'Information exposure through stack trace': [
    'app/api/*/route.ts',
    'app/api/*/*/route.ts'
  ],
  'Use of externally-controlled format string': [
    'app/api/repair-invoice/route.ts',
    'app/api/qbo/*/route.ts'
  ]
};

console.log('📊 CodeQL Issues Analysis\n');
console.log('Total Issue Categories:', Object.keys(issues).length);
console.log('Estimated Affected Endpoints:', 
  Object.values(issues).flat().filter((v, i, a) => a.indexOf(v) === i).length);

console.log('\n🔍 Issues by Category:\n');

Object.entries(issues).forEach(([category, files]) => {
  console.log(`${category}:`);
  console.log(`  Files: ${files.length}`);
  files.forEach(f => console.log(`    - ${f}`));
  console.log();
});

console.log('\n✅ Fixes Applied:\n');
console.log('1. ✅ repair-invoice/route.ts - Shell injection fixed');
console.log('2. ✅ pdf/[filename]/route.ts - Path traversal fixed');
console.log('3. ✅ output_jsons/[...file]/route.ts - Path traversal fixed');
console.log('4. ⏳ All other endpoints - Need systematic fixes');

console.log('\n📋 Remaining Work:\n');
console.log('1. Add input validation to all POST/PUT endpoints');
console.log('2. Add error sanitization to all endpoints');
console.log('3. Fix React components for XSS');
console.log('4. Add type validation to all dynamic parameters');
console.log('5. Run CodeQL scan to verify all fixes');

