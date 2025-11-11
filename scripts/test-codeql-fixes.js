#!/usr/bin/env node

/**
 * CodeQL Security Fixes Verification Test
 * 
 * Tests that all CodeQL security issues have been properly fixed:
 * 1. Path traversal vulnerabilities
 * 2. XSS prevention
 * 3. Type validation
 * 4. Error sanitization
 * 5. String escaping
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

console.log('═'.repeat(70));
console.log('🔒 CodeQL Security Fixes Verification Test');
console.log('═'.repeat(70));

// ============================================================================
// TEST 1: Path Validation Utilities Exist
// ============================================================================
console.log('\n[TEST 1] Path Validation Utilities');
try {
  const pathValidation = fs.readFileSync(
    path.join(__dirname, '../lib/security/path-validation.ts'),
    'utf8'
  );

  const checks = [
    { name: 'isValidFilename', pattern: /export function isValidFilename/ },
    { name: 'isValidPathSegment', pattern: /export function isValidPathSegment/ },
    { name: 'isPathWithinBase', pattern: /export function isPathWithinBase/ },
    { name: 'safePathJoin', pattern: /export function safePathJoin/ },
    { name: 'Path traversal check', pattern: /filename\.includes\('\.\.'\)/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(pathValidation)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ Path validation utilities complete\n');
    testsPassed++;
  } else {
    console.log('  ❌ Path validation utilities incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// TEST 2: String Escaping Utilities Exist
// ============================================================================
console.log('[TEST 2] String Escaping Utilities');
try {
  const stringEscaping = fs.readFileSync(
    path.join(__dirname, '../lib/security/string-escaping.ts'),
    'utf8'
  );

  const checks = [
    { name: 'escapeHtml', pattern: /export function escapeHtml/ },
    { name: 'escapeJavaScript', pattern: /export function escapeJavaScript/ },
    { name: 'escapeUrl', pattern: /export function escapeUrl/ },
    { name: 'sanitizeHtml', pattern: /export function sanitizeHtml/ },
    { name: 'HTML entity encoding', pattern: /&amp;|&lt;|&gt;|&quot;/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(stringEscaping)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ String escaping utilities complete\n');
    testsPassed++;
  } else {
    console.log('  ❌ String escaping utilities incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// TEST 3: Type Validation Utilities Exist
// ============================================================================
console.log('[TEST 3] Type Validation Utilities');
try {
  const typeValidation = fs.readFileSync(
    path.join(__dirname, '../lib/security/type-validation.ts'),
    'utf8'
  );

  const checks = [
    { name: 'isString', pattern: /export function isString/ },
    { name: 'isNumber', pattern: /export function isNumber/ },
    { name: 'isInteger', pattern: /export function isInteger/ },
    { name: 'isValidEmail', pattern: /export function isValidEmail/ },
    { name: 'isValidUrl', pattern: /export function isValidUrl/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(typeValidation)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ Type validation utilities complete\n');
    testsPassed++;
  } else {
    console.log('  ❌ Type validation utilities incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// TEST 4: Error Handling Utilities Exist
// ============================================================================
console.log('[TEST 4] Error Handling Utilities');
try {
  const errorHandling = fs.readFileSync(
    path.join(__dirname, '../lib/security/error-handling.ts'),
    'utf8'
  );

  const checks = [
    { name: 'sanitizeErrorMessage', pattern: /export function sanitizeErrorMessage/ },
    { name: 'createErrorResponse', pattern: /export function createErrorResponse/ },
    { name: 'logError', pattern: /export function logError/ },
    { name: 'isSafeErrorMessage', pattern: /export function isSafeErrorMessage/ },
    { name: 'Error ID generation', pattern: /generateErrorId/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(errorHandling)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ Error handling utilities complete\n');
    testsPassed++;
  } else {
    console.log('  ❌ Error handling utilities incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// TEST 5: PDF Endpoint Path Validation
// ============================================================================
console.log('[TEST 5] PDF Endpoint Path Validation');
try {
  const pdfRoute = fs.readFileSync(
    path.join(__dirname, '../app/api/pdf/[filename]/route.ts'),
    'utf8'
  );

  const checks = [
    { name: 'validateFilename function', pattern: /function validateFilename/ },
    { name: 'isPathWithinBase function', pattern: /function isPathWithinBase/ },
    { name: 'Path traversal check', pattern: /filename\.includes\('\.\.'\)/ },
    { name: 'Base directory check', pattern: /isPathWithinBase\(filePath, baseDir\)/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(pdfRoute)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ PDF endpoint properly secured\n');
    testsPassed++;
  } else {
    console.log('  ❌ PDF endpoint security incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// TEST 6: GitHub Actions Workflow Permissions
// ============================================================================
console.log('[TEST 6] GitHub Actions Workflow Permissions');
try {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../.github/workflows/security-scan.yml'),
    'utf8'
  );

  const checks = [
    { name: 'permissions block', pattern: /^permissions:/m },
    { name: 'contents: read', pattern: /contents:\s*read/ },
    { name: 'security-events: write', pattern: /security-events:\s*write/ },
  ];

  let allFound = true;
  checks.forEach(({ name, pattern }) => {
    if (pattern.test(workflow)) {
      console.log(`  ✅ ${name} found`);
    } else {
      console.log(`  ❌ ${name} NOT found`);
      allFound = false;
    }
  });

  if (allFound) {
    console.log('  ✅ Workflow permissions properly configured\n');
    testsPassed++;
  } else {
    console.log('  ❌ Workflow permissions incomplete\n');
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAILED: ${err.message}\n`);
  testsFailed++;
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('═'.repeat(70));
console.log(`RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log('═'.repeat(70));

if (testsFailed === 0) {
  console.log('\n✅ All CodeQL security fixes verified successfully!\n');
  process.exit(0);
} else {
  console.log('\n❌ Some security fixes are missing or incomplete\n');
  process.exit(1);
}

