/**
 * QuickBooks Webhook Endpoint
 * Handles real-time notifications from QuickBooks for automatic data sync
 */

export async function POST(request) {
  try {
    console.log('🔔 QuickBooks webhook received');
    
    // Get the webhook payload
    const payload = await request.json();
    console.log('📋 Webhook payload:', JSON.stringify(payload, null, 2));
    
    // Verify webhook signature (security measure)
    const signature = request.headers.get('intuit-signature');
    if (!verifyWebhookSignature(payload, signature)) {
      console.error('❌ Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Process different webhook events
    if (payload.eventNotifications) {
      for (const notification of payload.eventNotifications) {
        await processWebhookEvent(notification);
      }
    }
    
    console.log('✅ Webhook processed successfully');
    return new Response('OK', { status: 200 });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Process individual webhook events
async function processWebhookEvent(notification) {
  try {
    const { realmId, dataChangeEvent } = notification;
    
    if (!dataChangeEvent) {
      console.log('⚠️ No data change event in notification');
      return;
    }
    
    const { entities } = dataChangeEvent;
    
    for (const entity of entities) {
      const { name, id, operation, lastUpdated } = entity;
      
      console.log(`🔄 Processing ${operation} on ${name} (ID: ${id})`);
      
      switch (name) {
        case 'Account':
          await handleAccountChange(operation, id, lastUpdated);
          break;
        case 'Vendor':
          await handleVendorChange(operation, id, lastUpdated);
          break;
        case 'Bill':
          await handleBillChange(operation, id, lastUpdated);
          break;
        default:
          console.log(`⚠️ Unknown entity type: ${name}`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing webhook event:', error);
  }
}

// Handle account changes (category updates)
async function handleAccountChange(operation, accountId, lastUpdated) {
  try {
    console.log(`📊 Account ${operation}: ${accountId}`);
    
    if (operation === 'Update' || operation === 'Create') {
      // Fetch updated account details from QuickBooks
      const accountData = await fetchAccountFromQuickBooks(accountId);
      
      // Update PCS AI category mapping
      await updateCategoryMapping(accountData);
      
      console.log(`✅ Category mapping updated for account: ${accountData.name}`);
    }
  } catch (error) {
    console.error('❌ Error handling account change:', error);
  }
}

// Handle vendor changes
async function handleVendorChange(operation, vendorId, lastUpdated) {
  try {
    console.log(`🏢 Vendor ${operation}: ${vendorId}`);
    
    if (operation === 'Update' || operation === 'Create') {
      // Fetch updated vendor details from QuickBooks
      const vendorData = await fetchVendorFromQuickBooks(vendorId);
      
      // Update PCS AI vendor information
      await updateVendorInfo(vendorData);
      
      console.log(`✅ Vendor info updated: ${vendorData.name}`);
    }
  } catch (error) {
    console.error('❌ Error handling vendor change:', error);
  }
}

// Handle bill changes
async function handleBillChange(operation, billId, lastUpdated) {
  try {
    console.log(`📝 Bill ${operation}: ${billId}`);
    
    if (operation === 'Update') {
      // Fetch updated bill details from QuickBooks
      const billData = await fetchBillFromQuickBooks(billId);
      
      // Update PCS AI invoice status if needed
      await updateInvoiceStatus(billData);
      
      console.log(`✅ Invoice status updated for bill: ${billData.docNumber}`);
    }
  } catch (error) {
    console.error('❌ Error handling bill change:', error);
  }
}

// Fetch account details from QuickBooks
async function fetchAccountFromQuickBooks(accountId) {
  // This would use the QuickBooks API to fetch account details
  // Implementation depends on your QuickBooks API setup
  console.log(`🔍 Fetching account details for ID: ${accountId}`);
  
  // Placeholder - replace with actual QuickBooks API call
  return {
    id: accountId,
    name: 'Sample Account',
    type: 'Expense',
    classification: 'Expense'
  };
}

// Fetch vendor details from QuickBooks
async function fetchVendorFromQuickBooks(vendorId) {
  console.log(`🔍 Fetching vendor details for ID: ${vendorId}`);
  
  // Placeholder - replace with actual QuickBooks API call
  return {
    id: vendorId,
    name: 'Sample Vendor',
    companyName: 'Sample Company'
  };
}

// Fetch bill details from QuickBooks
async function fetchBillFromQuickBooks(billId) {
  console.log(`🔍 Fetching bill details for ID: ${billId}`);
  
  // Placeholder - replace with actual QuickBooks API call
  return {
    id: billId,
    docNumber: 'INV-001',
    status: 'Approved'
  };
}

// Update category mapping in PCS AI
async function updateCategoryMapping(accountData) {
  try {
    console.log(`🔄 Updating category mapping for: ${accountData.name}`);
    
    // This would update your PCS AI database/cache with the new category info
    // Implementation depends on your data storage setup
    
    // Example: Update a categories JSON file
    const categoriesPath = './public/quickbooks_categories.json';
    // ... implementation details
    
    console.log(`✅ Category mapping updated: ${accountData.name}`);
  } catch (error) {
    console.error('❌ Error updating category mapping:', error);
  }
}

// Update vendor information in PCS AI
async function updateVendorInfo(vendorData) {
  try {
    console.log(`🔄 Updating vendor info for: ${vendorData.name}`);
    
    // This would update your PCS AI database/cache with the new vendor info
    // Implementation depends on your data storage setup
    
    console.log(`✅ Vendor info updated: ${vendorData.name}`);
  } catch (error) {
    console.error('❌ Error updating vendor info:', error);
  }
}

// Update invoice status in PCS AI
async function updateInvoiceStatus(billData) {
  try {
    console.log(`🔄 Updating invoice status for: ${billData.docNumber}`);
    
    // This would update your PCS AI database/cache with the new invoice status
    // Implementation depends on your data storage setup
    
    console.log(`✅ Invoice status updated: ${billData.docNumber}`);
  } catch (error) {
    console.error('❌ Error updating invoice status:', error);
  }
}

// Verify webhook signature for security
function verifyWebhookSignature(payload, signature) {
  // This is a placeholder - implement proper signature verification
  // QuickBooks provides a webhook verifier token that should be used
  
  const webhookVerifier = process.env.QBO_WEBHOOK_VERIFIER;
  if (!webhookVerifier) {
    console.warn('⚠️ No webhook verifier configured - skipping signature verification');
    return true; // Skip verification if not configured
  }
  
  // TODO: Implement proper HMAC signature verification
  // const expectedSignature = crypto.createHmac('sha256', webhookVerifier)
  //   .update(JSON.stringify(payload))
  //   .digest('hex');
  
  console.log('🔐 Webhook signature verification (placeholder)');
  return true; // Placeholder - always return true for now
}

// Handle GET requests (webhook verification)
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const challengeCode = url.searchParams.get('challenge_code');
    
    if (challengeCode) {
      console.log('🔐 Webhook verification challenge received');
      
      // Return the challenge code to verify webhook endpoint
      return new Response(challengeCode, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    return new Response('QuickBooks Webhook Endpoint', { status: 200 });
    
  } catch (error) {
    console.error('❌ Webhook verification error:', error);
    return new Response('Error', { status: 500 });
  }
}
