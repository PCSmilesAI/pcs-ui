const fetch = require('node-fetch');

async function testApproval() {
  try {
    // First, get a test invoice
    const invoicesRes = await fetch('http://localhost:3000/api/invoices/visible-db');
    const invoicesData = await invoicesRes.json();
    
    if (!invoicesData.invoices || invoicesData.invoices.length === 0) {
      console.log('No invoices found');
      return;
    }
    
    const testInvoice = invoicesData.invoices[0];
    console.log('Test invoice:', {
      id: testInvoice.id,
      invoice_number: testInvoice.invoice_number,
      status: testInvoice.status,
      approvals: testInvoice.approvals
    });
    
    // Try to approve it
    const approveRes = await fetch('http://localhost:3000/api/invoices/transition-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testInvoice.id,
        action: 'approve',
        office: testInvoice.office_id || 'Test Office'
      })
    });
    
    const approveData = await approveRes.json();
    console.log('Approval response:', {
      status: approveRes.status,
      ok: approveRes.ok,
      data: approveData
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testApproval();
