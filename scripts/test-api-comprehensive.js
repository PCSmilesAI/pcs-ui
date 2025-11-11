#!/usr/bin/env node

/**
 * COMPREHENSIVE API ENDPOINT TEST
 * Tests all REST API endpoints with edge cases and error handling
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.API_URL || 'https://pcsmilesai.com';
let testsPassed = 0;
let testsFailed = 0;

console.log('🔍 COMPREHENSIVE API ENDPOINT TEST\n');
console.log(`Testing against: ${BASE_URL}\n`);

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// TEST 1: Health Check Endpoint
// ============================================================================
async function testHealthEndpoint() {
  console.log('TEST 1: Health Check Endpoint');
  try {
    const result = await makeRequest('GET', '/api/health');
    
    if (result.status === 200 && result.body && result.body.ok === true) {
      console.log('  ✅ Health endpoint responding correctly\n');
      testsPassed++;
    } else {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 2: Inbox Health Endpoint
// ============================================================================
async function testInboxHealthEndpoint() {
  console.log('TEST 2: Inbox Health Endpoint');
  try {
    const result = await makeRequest('GET', '/api/inbox/health');
    
    if (result.status === 200 && result.body && result.body.ok === true) {
      console.log('  ✅ Inbox health endpoint responding correctly\n');
      testsPassed++;
    } else {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 3: Reconciliation Endpoint
// ============================================================================
async function testReconciliationEndpoint() {
  console.log('TEST 3: Reconciliation Endpoint');
  try {
    const result = await makeRequest('GET', '/api/inbox/reconcile');
    
    if (result.status === 200 && result.body && result.body.ok === true) {
      const report = result.body.report;
      if (report && typeof report.healthScore === 'number' && report.healthScore >= 0 && report.healthScore <= 100) {
        console.log(`  ✅ Reconciliation endpoint working (health: ${report.healthScore}%)\n`);
        testsPassed++;
      } else {
        throw new Error('Invalid health score in report');
      }
    } else {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 4: Invoices Visible Endpoint
// ============================================================================
async function testInvoicesVisibleEndpoint() {
  console.log('TEST 4: Invoices Visible Endpoint');
  try {
    const result = await makeRequest('GET', '/api/invoices/visible');

    if (result.status === 200 && result.body && result.body.ok === true && Array.isArray(result.body.invoices)) {
      console.log(`  ✅ Invoices visible endpoint working (${result.body.invoices.length} invoices)\n`);
      testsPassed++;
    } else {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 5: Invoice Detail Endpoint
// ============================================================================
async function testInvoiceDetailEndpoint() {
  console.log('TEST 5: Invoice Detail Endpoint');
  try {
    // First get a list of invoices
    const listResult = await makeRequest('GET', '/api/invoices/visible');

    if (listResult.body && listResult.body.invoices && listResult.body.invoices.length > 0) {
      const invoiceId = listResult.body.invoices[0].id;
      const detailResult = await makeRequest('GET', `/api/invoices/${invoiceId}`);

      if (detailResult.status === 200 && detailResult.body && detailResult.body.id === invoiceId) {
        console.log('  ✅ Invoice detail endpoint working\n');
        testsPassed++;
      } else {
        throw new Error(`Unexpected status: ${detailResult.status}`);
      }
    } else {
      console.log('  ⚠️  SKIPPED: No invoices available for testing\n');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 6: 404 Error Handling
// ============================================================================
async function test404ErrorHandling() {
  console.log('TEST 6: 404 Error Handling');
  try {
    const result = await makeRequest('GET', '/api/invoices/nonexistent-id-12345');
    
    if (result.status === 404) {
      console.log('  ✅ 404 errors handled correctly\n');
      testsPassed++;
    } else {
      throw new Error(`Expected 404, got ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 7: Invalid Request Handling
// ============================================================================
async function testInvalidRequestHandling() {
  console.log('TEST 7: Invalid Request Handling');
  try {
    const result = await makeRequest('POST', '/api/invoices/ingest', {
      // Missing required fields
      vendor_name: 'Test'
    });
    
    if (result.status >= 400) {
      console.log('  ✅ Invalid requests rejected correctly\n');
      testsPassed++;
    } else {
      throw new Error(`Expected error status, got ${result.status}`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 8: Response Headers
// ============================================================================
async function testResponseHeaders() {
  console.log('TEST 8: Response Headers');
  try {
    const result = await makeRequest('GET', '/api/health');
    
    const hasContentType = result.headers['content-type'] && result.headers['content-type'].includes('application/json');
    
    if (hasContentType) {
      console.log('  ✅ Response headers correct\n');
      testsPassed++;
    } else {
      throw new Error('Missing or incorrect Content-Type header');
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function runAllTests() {
  await testHealthEndpoint();
  await testInboxHealthEndpoint();
  await testReconciliationEndpoint();
  await testInvoicesVisibleEndpoint();
  await testInvoiceDetailEndpoint();
  await test404ErrorHandling();
  await testInvalidRequestHandling();
  await testResponseHeaders();

  // Summary
  console.log('═'.repeat(60));
  console.log(`RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═'.repeat(60));

  process.exit(testsFailed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

