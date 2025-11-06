#!/usr/bin/env node

/**
 * Test all invoice API endpoints for functionality and performance
 */

const http = require('http');
const BASE_URL = process.env.API_URL || 'http://localhost:3000';

let testsPassed = 0;
let testsFailed = 0;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
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

async function runTests() {
  console.log('\n🔍 API ENDPOINT TESTS');
  console.log('====================\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  // ========================================================================
  // 1. HEALTH CHECK
  // ========================================================================
  console.log('📋 HEALTH CHECK');
  console.log('---------------');

  await test('GET /api/health returns 200', async () => {
    const res = await makeRequest('GET', '/api/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /api/db/init initializes database', async () => {
    const res = await makeRequest('GET', '/api/db/init');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.ok === true, 'Response should have ok: true');
  });

  // ========================================================================
  // 2. INVOICE VISIBILITY ENDPOINT
  // ========================================================================
  console.log('\n📊 INVOICE VISIBILITY ENDPOINT');
  console.log('------------------------------');

  await test('GET /api/invoices/visible returns invoices', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.ok === true, 'Response should have ok: true');
    assert(Array.isArray(res.body.invoices), 'Should return invoices array');
  });

  await test('GET /api/invoices/visible with limit parameter', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?limit=10');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.invoices.length <= 10, 'Should respect limit parameter');
  });

  await test('GET /api/invoices/visible with offset parameter', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?limit=5&offset=0');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.invoices.length <= 5, 'Should respect offset parameter');
  });

  await test('GET /api/invoices/visible with status filter', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?status=paid');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    // All returned invoices should have status 'paid' or be empty
    if (res.body.invoices.length > 0) {
      const allPaid = res.body.invoices.every(inv => inv.status === 'paid');
      assert(allPaid, 'All invoices should have status=paid');
    }
  });

  await test('GET /api/invoices/visible with vendor filter', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?vendor=test');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ========================================================================
  // 3. INVOICE DETAIL ENDPOINT
  // ========================================================================
  console.log('\n📄 INVOICE DETAIL ENDPOINT');
  console.log('--------------------------');

  await test('GET /api/invoices/[id] returns 404 for nonexistent invoice', async () => {
    const res = await makeRequest('GET', '/api/invoices/nonexistent-id');
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  // ========================================================================
  // 4. PERFORMANCE TESTS
  // ========================================================================
  console.log('\n⚡ PERFORMANCE TESTS');
  console.log('-------------------');

  await test('Large result set (limit=1000) completes in reasonable time', async () => {
    const start = Date.now();
    const res = await makeRequest('GET', '/api/invoices/visible?limit=1000');
    const elapsed = Date.now() - start;
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(elapsed < 5000, `Request took ${elapsed}ms, should be < 5000ms`);
    console.log(`   Response time: ${elapsed}ms for ${res.body.invoices.length} invoices`);
  });

  await test('Pagination with large offset works', async () => {
    const start = Date.now();
    const res = await makeRequest('GET', '/api/invoices/visible?limit=100&offset=500');
    const elapsed = Date.now() - start;
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(elapsed < 2000, `Request took ${elapsed}ms, should be < 2000ms`);
  });

  // ========================================================================
  // 5. RESPONSE STRUCTURE VALIDATION
  // ========================================================================
  console.log('\n🔍 RESPONSE STRUCTURE VALIDATION');
  console.log('--------------------------------');

  await test('Invoice objects have required fields', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?limit=1');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    
    if (res.body.invoices.length > 0) {
      const inv = res.body.invoices[0];
      const required = ['id', 'invoice_number', 'vendor_name', 'amount_cents', 'status'];
      for (const field of required) {
        assert(field in inv, `Missing required field: ${field}`);
      }
    }
  });

  await test('Three-layer fields are present in response', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?limit=1');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    
    if (res.body.invoices.length > 0) {
      const inv = res.body.invoices[0];
      // Should have either parsed or effective fields
      assert(
        ('parsed_vendor_name' in inv || 'vendor_name' in inv),
        'Should have parsed or effective vendor_name'
      );
    }
  });

  // ========================================================================
  // 6. ERROR HANDLING
  // ========================================================================
  console.log('\n⚠️  ERROR HANDLING');
  console.log('-----------------');

  await test('Invalid limit parameter is handled', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?limit=invalid');
    // Should either return 400 or use default limit
    assert(res.status === 200 || res.status === 400, `Unexpected status: ${res.status}`);
  });

  await test('Invalid offset parameter is handled', async () => {
    const res = await makeRequest('GET', '/api/invoices/visible?offset=invalid');
    // Should either return 400 or use default offset
    assert(res.status === 200 || res.status === 400, `Unexpected status: ${res.status}`);
  });

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n📊 TEST SUMMARY');
  console.log('===============');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n🎉 ALL API TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

