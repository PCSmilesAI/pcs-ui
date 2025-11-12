#!/usr/bin/env node

/**
 * Comprehensive Stripe API Test Suite
 * Tests all Stripe integration functionality
 */

const Stripe = require('stripe');
const https = require('https');

// Configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const PCS_STRIPE_WEBHOOK_SECRET = process.env.PCS_STRIPE_WEBHOOK_SECRET;
const API_URL = process.env.API_URL || 'https://pcsmilesai.com';

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test function
async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: `❌ FAIL: ${error.message}` });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// Main test suite
async function runTests() {
  console.log('\n🧪 Stripe API Test Suite\n');
  console.log('Configuration:');
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Stripe Secret Key: ${STRIPE_SECRET_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  Stripe Publishable Key: ${STRIPE_PUBLISHABLE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  Webhook Secret: ${PCS_STRIPE_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log('\n');

  if (!STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY is not set. Cannot run tests.');
    process.exit(1);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Test 1: Stripe API Connection
  await test('Stripe API Connection', async () => {
    const account = await stripe.accounts.retrieve();
    if (!account.id) throw new Error('No account ID returned');
  });

  // Test 2: Stripe Account Status
  await test('Stripe Account Status', async () => {
    const account = await stripe.accounts.retrieve();
    console.log(`    Account ID: ${account.id}`);
    console.log(`    Account Type: ${account.type}`);
    console.log(`    Charges Enabled: ${account.charges_enabled}`);
    console.log(`    Payouts Enabled: ${account.payouts_enabled}`);
  });

  // Test 3: Stripe Ping Endpoint
  await test('Stripe Ping Endpoint (/api/stripe/ping)', async () => {
    const response = await makeRequest('GET', '/api/stripe/ping');
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    if (!response.body.ok) throw new Error('Endpoint returned ok: false');
  });

  // Test 4: Stripe Status Endpoint
  await test('Stripe Status Endpoint (/api/stripe/status)', async () => {
    const response = await makeRequest('GET', '/api/stripe/status');
    if (response.status !== 200) throw new Error(`Status ${response.status}`);
    if (!response.body.connected) throw new Error('Not connected to Stripe');
  });

  // Test 5: Create Payment Intent
  await test('Create Payment Intent', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 500, // $5.00
      currency: 'usd',
      metadata: {
        test: 'true',
        timestamp: new Date().toISOString(),
      },
    });
    if (!intent.id) throw new Error('No payment intent ID returned');
    if (!intent.client_secret) throw new Error('No client secret returned');
    console.log(`    Payment Intent ID: ${intent.id}`);
    console.log(`    Status: ${intent.status}`);
  });

  // Test 6: Retrieve Payment Intent
  await test('Retrieve Payment Intent', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 500,
      currency: 'usd',
    });
    const retrieved = await stripe.paymentIntents.retrieve(intent.id);
    if (retrieved.id !== intent.id) throw new Error('Retrieved intent ID mismatch');
  });

  // Test 7: List Payment Intents
  await test('List Payment Intents', async () => {
    const intents = await stripe.paymentIntents.list({ limit: 5 });
    if (!Array.isArray(intents.data)) throw new Error('No data array returned');
    console.log(`    Found ${intents.data.length} recent payment intents`);
  });

  // Test 8: Create Customer
  await test('Create Customer', async () => {
    const customer = await stripe.customers.create({
      email: `test-${Date.now()}@example.com`,
      metadata: {
        test: 'true',
      },
    });
    if (!customer.id) throw new Error('No customer ID returned');
    console.log(`    Customer ID: ${customer.id}`);
  });

  // Test 9: List Customers
  await test('List Customers', async () => {
    const customers = await stripe.customers.list({ limit: 5 });
    if (!Array.isArray(customers.data)) throw new Error('No data array returned');
    console.log(`    Found ${customers.data.length} recent customers`);
  });

  // Test 10: Webhook Secret Validation
  await test('Webhook Secret Configuration', async () => {
    if (!PCS_STRIPE_WEBHOOK_SECRET) {
      throw new Error('PCS_STRIPE_WEBHOOK_SECRET not configured');
    }
    console.log(`    Webhook Secret: ${PCS_STRIPE_WEBHOOK_SECRET.substring(0, 20)}...`);
  });

  // Test 11: API Rate Limiting
  await test('API Rate Limiting', async () => {
    // Make multiple rapid requests
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(makeRequest('GET', '/api/stripe/status'));
    }
    const responses = await Promise.all(promises);
    const allSuccessful = responses.every((r) => r.status === 200);
    if (!allSuccessful) throw new Error('Some requests failed');
    console.log(`    Made 5 concurrent requests successfully`);
  });

  // Test 12: Error Handling
  await test('Error Handling - Invalid Payment Intent', async () => {
    try {
      await stripe.paymentIntents.retrieve('pi_invalid_id');
      throw new Error('Should have thrown an error');
    } catch (error) {
      if (error.message === 'Should have thrown an error') throw error;
      // Expected error
    }
  });

  // Test 13: Metadata Handling
  await test('Metadata Handling', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 500,
      currency: 'usd',
      metadata: {
        invoiceId: 'test-123',
        vendor: 'Test Vendor',
        paidBy: 'test@example.com',
      },
    });
    if (intent.metadata.invoiceId !== 'test-123') throw new Error('Metadata not preserved');
  });

  // Test 14: Currency Support
  await test('Currency Support (USD)', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 500,
      currency: 'usd',
    });
    if (intent.currency !== 'usd') throw new Error('Currency mismatch');
  });

  // Test 15: Amount Validation
  await test('Amount Validation', async () => {
    try {
      await stripe.paymentIntents.create({
        amount: 0,
        currency: 'usd',
      });
      throw new Error('Should have rejected zero amount');
    } catch (error) {
      if (error.message === 'Should have rejected zero amount') throw error;
      // Expected error
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.failed}`);
  console.log(`✨ Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
  console.log('='.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

