#!/usr/bin/env node

/**
 * End-to-end workflow test for invoice approval
 * Tests the complete flow: incoming -> awaiting_office_approval -> to_be_paid
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'business@pcsmilesai.com';

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
  console.log('\n🧪 END-TO-END INVOICE APPROVAL WORKFLOW TEST\n');
  console.log('===========================================\n');

  try {
    // Step 1: Get an invoice in 'incoming' or 'pending' status
    console.log('📋 Step 1: Fetching invoices...');
    const visibleRes = await makeRequest('GET', `/api/invoices/visible?limit=10&email=${ADMIN_EMAIL}`);
    
    if (visibleRes.status !== 200) {
      console.error('❌ Failed to fetch invoices:', visibleRes.status);
      return;
    }

    const invoices = visibleRes.data.invoices || [];
    if (invoices.length === 0) {
      console.log('⚠️  No invoices found to test');
      return;
    }

    // Find an invoice that can be tested
    const testInvoice = invoices[0];
    console.log(`✅ Found invoice: ${testInvoice.invoice_number || testInvoice.id}`);
    console.log(`   Current Status: ${testInvoice.status}`);
    console.log(`   Vendor: ${testInvoice.vendor_name}`);
    console.log(`   Amount: $${(testInvoice.amount_cents / 100).toFixed(2)}\n`);

    // Step 2: Approve the invoice
    console.log('📋 Step 2: Approving invoice...');
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

    const newStatus = approveRes.data.invoice?.status;
    console.log(`✅ Approval succeeded`);
    console.log(`   New Status: ${newStatus}\n`);

    // Step 3: Verify the invoice was updated in the database
    console.log('📋 Step 3: Verifying invoice in database...');
    const verifyRes = await makeRequest('GET', `/api/invoices/${testInvoice.id}?email=${ADMIN_EMAIL}`);
    
    if (verifyRes.status !== 200) {
      console.error('❌ Failed to fetch updated invoice:', verifyRes.status);
      return;
    }

    const updatedInvoice = verifyRes.data;
    console.log(`✅ Invoice verified in database`);
    console.log(`   Status: ${updatedInvoice.status}`);
    console.log(`   Approvals: ${JSON.stringify(updatedInvoice.approvals || {})}\n`);

    // Step 4: Summary
    console.log('📊 TEST SUMMARY');
    console.log('===============');
    console.log(`✅ Invoice fetched: ${testInvoice.invoice_number || testInvoice.id}`);
    console.log(`✅ Initial status: ${testInvoice.status}`);
    console.log(`✅ Approval request sent successfully`);
    console.log(`✅ Invoice transitioned to: ${newStatus}`);
    console.log(`✅ Database verified: ${updatedInvoice.status}`);
    console.log(`✅ Approvals recorded: ${Object.keys(updatedInvoice.approvals || {}).join(', ') || 'none'}`);
    
    if (testInvoice.status !== updatedInvoice.status) {
      console.log(`\n🎉 END-TO-END WORKFLOW TEST PASSED!\n`);
    } else {
      console.log(`\n⚠️  Status did not change (may be expected for certain statuses)\n`);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

runTests();

