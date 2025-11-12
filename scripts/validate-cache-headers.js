#!/usr/bin/env node

/**
 * Cache Headers Validation Script
 * 
 * Validates that cache headers are properly configured on all endpoints.
 * Run this before deployment to ensure no caching issues.
 * 
 * Usage: node scripts/validate-cache-headers.js [url]
 * Example: node scripts/validate-cache-headers.js https://pcsmilesai.com
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:3000';

// Test cases: [path, expectedCacheControl, description]
const TEST_CASES = [
  // HTML pages - should never cache
  ['/', 'no-store', 'Home page should not be cached'],
  ['/LoginPage', 'no-store', 'Login page should not be cached'],
  ['/SignupPage', 'no-store', 'Signup page should not be cached'],
  ['/ForMePage', 'no-store', 'ForMe page should not be cached'],
  ['/ToBePaidPage', 'no-store', 'ToBePaid page should not be cached'],

  // API routes - should never cache
  ['/api/health', 'no-store', 'Health check should not be cached'],
  ['/api/invoices/visible', 'no-store', 'Invoice list should not be cached'],

  // Static assets - should cache forever
  ['/_next/static/chunks/main.js', 'max-age=31536000', 'Static chunks should cache forever'],
];

let passed = 0;
let failed = 0;

/**
 * Make HTTP request and check headers
 */
async function checkHeaders(path, expectedCacheControl, description) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'HEAD',
      timeout: 5000,
    };

    const req = protocol.request(options, (res) => {
      const cacheControl = res.headers['cache-control'] || '';
      const pragma = res.headers['pragma'] || '';
      const expires = res.headers['expires'] || '';

      const hasExpected = cacheControl.includes(expectedCacheControl);
      const status = hasExpected ? '✅' : '❌';

      console.log(`\n${status} ${description}`);
      console.log(`   Path: ${path}`);
      console.log(`   Expected: ${expectedCacheControl}`);
      console.log(`   Cache-Control: ${cacheControl || '(not set)'}`);
      if (pragma) console.log(`   Pragma: ${pragma}`);
      if (expires) console.log(`   Expires: ${expires}`);

      if (hasExpected) {
        passed++;
      } else {
        failed++;
      }

      resolve();
    });

    req.on('error', (err) => {
      console.log(`\n❌ ${description}`);
      console.log(`   Path: ${path}`);
      console.log(`   Error: ${err.message}`);
      failed++;
      resolve();
    });

    req.on('timeout', () => {
      console.log(`\n❌ ${description}`);
      console.log(`   Path: ${path}`);
      console.log(`   Error: Request timeout`);
      req.destroy();
      failed++;
      resolve();
    });

    req.end();
  });
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🔍 Cache Headers Validation');
  console.log('============================\n');
  console.log(`Testing: ${BASE_URL}\n`);

  for (const [path, expectedCacheControl, description] of TEST_CASES) {
    await checkHeaders(path, expectedCacheControl, description);
  }

  console.log('\n============================');
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('✅ All cache headers are correctly configured!');
    console.log('\n✨ Users will NOT see stale code or bugs.');
    console.log('✨ No need for private/incognito mode.');
    process.exit(0);
  } else {
    console.log('❌ Some cache headers are not configured correctly.');
    console.log('\n⚠️  Users may see stale code or bugs.');
    console.log('⚠️  Please fix the cache configuration before deploying.');
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

