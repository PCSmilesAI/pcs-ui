/**
 * QuickBooks Webhook Endpoint
 * Handles real-time notifications from QuickBooks for automatic data sync
 */

module.exports = async (req, res) => {
  try {
    console.log('🔔 QuickBooks webhook received');
    
    // Handle GET requests for testing
    if (req.method === 'GET') {
      return res.status(200).send('QuickBooks Webhook Endpoint');
    }
    
    // Handle POST requests for actual webhooks
    if (req.method === 'POST') {
      console.log('📋 Webhook payload:', JSON.stringify(req.body, null, 2));
      
      // Verify webhook signature (security measure)
      const signature = req.headers['intuit-signature'];
      if (!verifyWebhookSignature(req.body, signature)) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).send('Unauthorized');
      }
      
      // Process different webhook events
      if (req.body.eventNotifications) {
        for (const notification of req.body.eventNotifications) {
          await processWebhookEvent(notification);
        }
      }
      
      console.log('✅ Webhook processed successfully');
      return res.status(200).send('OK');
    }
    
    // Handle other methods
    return res.status(405).send('Method Not Allowed');
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
};

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
      
      // Update PCS AI vendor mapping
      await updateVendorMapping(vendorData);
      
      console.log(`✅ Vendor mapping updated: ${vendorData.displayName}`);
    }
  } catch (error) {
    console.error('❌ Error handling vendor change:', error);
  }
}

// Handle bill changes
async function handleBillChange(operation, billId, lastUpdated) {
  try {
    console.log(`💰 Bill ${operation}: ${billId}`);
    
    if (operation === 'Update' || operation === 'Create') {
      // Fetch updated bill details from QuickBooks
      const billData = await fetchBillFromQuickBooks(billId);
      
      // Update PCS AI invoice status
      await updateInvoiceStatus(billData);
      
      console.log(`✅ Invoice status updated: ${billData.docNumber}`);
    }
  } catch (error) {
    console.error('❌ Error handling bill change:', error);
  }
}

// Verify webhook signature for security
function verifyWebhookSignature(payload, signature) {
  try {
    // For now, accept all webhooks (implement proper verification later)
    // TODO: Implement HMAC signature verification
    console.log('🔐 Webhook signature verification (placeholder)');
    return true;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// Fetch account data from QuickBooks
async function fetchAccountFromQuickBooks(accountId) {
  try {
    // TODO: Implement QuickBooks API call
    console.log(`📊 Fetching account ${accountId} from QuickBooks`);
    return { id: accountId, name: 'Sample Account' };
  } catch (error) {
    console.error('❌ Error fetching account:', error);
    throw error;
  }
}

// Fetch vendor data from QuickBooks
async function fetchVendorFromQuickBooks(vendorId) {
  try {
    // TODO: Implement QuickBooks API call
    console.log(`🏢 Fetching vendor ${vendorId} from QuickBooks`);
    return { id: vendorId, displayName: 'Sample Vendor' };
  } catch (error) {
    console.error('❌ Error fetching vendor:', error);
    throw error;
  }
}

// Fetch bill data from QuickBooks
async function fetchBillFromQuickBooks(billId) {
  try {
    // TODO: Implement QuickBooks API call
    console.log(`💰 Fetching bill ${billId} from QuickBooks`);
    return { id: billId, docNumber: 'BILL-001' };
  } catch (error) {
    console.error('❌ Error fetching bill:', error);
    throw error;
  }
}

// Update category mapping in PCS AI
async function updateCategoryMapping(accountData) {
  try {
    // TODO: Implement PCS AI category update
    console.log(`📊 Updating category mapping for: ${accountData.name}`);
  } catch (error) {
    console.error('❌ Error updating category mapping:', error);
    throw error;
  }
}

// Update vendor mapping in PCS AI
async function updateVendorMapping(vendorData) {
  try {
    // TODO: Implement PCS AI vendor update
    console.log(`🏢 Updating vendor mapping for: ${vendorData.displayName}`);
  } catch (error) {
    console.error('❌ Error updating vendor mapping:', error);
    throw error;
  }
}

// Update invoice status in PCS AI
async function updateInvoiceStatus(billData) {
  try {
    // TODO: Implement PCS AI invoice status update
    console.log(`💰 Updating invoice status for: ${billData.docNumber}`);
  } catch (error) {
    console.error('❌ Error updating invoice status:', error);
    throw error;
  }
}
