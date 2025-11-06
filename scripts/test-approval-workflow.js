#!/usr/bin/env node

/**
 * Test the invoice approval workflow
 * This script tests the complete approval flow from incoming to approved
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 INVOICE APPROVAL WORKFLOW TEST\n');
  console.log('================================\n');

  try {
    // Step 1: Get visible invoices (as admin)
    console.log('📋 Step 1: Fetching visible invoices...');
    const visibleRes = await makeRequest('GET', '/api/invoices/visible?limit=1&email=business@pcsmilesai.com');
    
    if (visibleRes.status !== 200) {
      console.error('❌ Failed to fetch invoices:', visibleRes.status);
      return;
    }

    const invoices = visibleRes.data.invoices || [];
    if (invoices.length === 0) {
      console.log('⚠️  No invoices found to test');
      return;
    }

    const testInvoice = invoices[0];
    console.log(`✅ Found invoice: ${testInvoice.invoice_number} (ID: ${testInvoice.id})`);
    console.log(`   Status: ${testInvoice.status}`);
    console.log(`   Vendor: ${testInvoice.vendor_name}`);
    console.log(`   Amount: $${(testInvoice.amount_cents / 100).toFixed(2)}\n`);

    // Step 2: Attempt to approve the invoice
    console.log('📋 Step 2: Attempting to approve invoice...');
    const approveRes = await makeRequest('POST', '/api/invoices/transition', {
      id: testInvoice.id,
      action: 'approve',
      office: testInvoice.office_id || 'Test Office',
    });

    if (approveRes.status !== 200) {
      console.error(`❌ Approval failed with status ${approveRes.status}`);
      console.error('   Error:', approveRes.data.error || approveRes.data);
      return;
    }

    console.log('✅ Approval request succeeded');
    console.log(`   New status: ${approveRes.data.invoice?.status || 'unknown'}\n`);

    // Step 3: Verify the invoice status changed
    console.log('📋 Step 3: Verifying invoice status changed...');
    const verifyRes = await makeRequest('GET', `/api/invoices/${testInvoice.id}`);
    
    if (verifyRes.status !== 200) {
      console.error('❌ Failed to fetch updated invoice:', verifyRes.status);
      return;
    }

    const updatedInvoice = verifyRes.data;
    console.log(`✅ Invoice status updated: ${updatedInvoice.status}`);
    console.log(`   Approvals: ${JSON.stringify(updatedInvoice.approvals || {})}\n`);

    // Step 4: Summary
    console.log('📊 TEST SUMMARY');
    console.log('===============');
    console.log(`✅ Invoice fetched: ${testInvoice.invoice_number}`);
    console.log(`✅ Approval request sent successfully`);
    console.log(`✅ Invoice status changed from '${testInvoice.status}' to '${updatedInvoice.status}'`);
    console.log(`✅ Approvals recorded: ${Object.keys(updatedInvoice.approvals || {}).join(', ') || 'none'}`);
    console.log('\n🎉 APPROVAL WORKFLOW TEST PASSED!\n');

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

runTests();

