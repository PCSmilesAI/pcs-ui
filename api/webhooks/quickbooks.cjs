/**
 * QuickBooks Webhook Endpoint - Enhanced Version
 * Handles real-time notifications from QuickBooks for automatic data sync
 */

const QuickBooksAPI = require('../qbo/api-client.cjs');

module.exports = async (req, res) => {
  try {
    console.log('🔔 QuickBooks webhook received');
    
    // Handle GET requests for testing
    if (req.method === 'GET') {
      console.log('✅ GET request handled successfully');
      return res.status(200).send('QuickBooks Webhook Endpoint - Enhanced!');
    }
    
    // Handle POST requests for actual webhooks
    if (req.method === 'POST') {
      console.log('📋 Processing webhook payload...');
      
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
      const accountData = await QuickBooksAPI.makeRequest(`/account/${accountId}`);
      
      // Update PCS AI category mapping
      await updateCategoryMapping(accountData.Account);
      
      console.log(`✅ Category mapping updated for account: ${accountData.Account.Name}`);
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
      const vendorData = await QuickBooksAPI.makeRequest(`/vendor/${vendorId}`);
      
      // Update PCS AI vendor mapping
      await updateVendorMapping(vendorData.Vendor);
      
      console.log(`✅ Vendor mapping updated: ${vendorData.Vendor.DisplayName}`);
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
      const billData = await QuickBooksAPI.makeRequest(`/bill/${billId}`);
      
      // Update PCS AI invoice status
      await updateInvoiceStatus(billData.Bill);
      
      console.log(`✅ Invoice status updated: ${billData.Bill.DocNumber}`);
    }
  } catch (error) {
    console.error('❌ Error handling bill change:', error);
  }
}

// Verify webhook signature for security
function verifyWebhookSignature(payload, signature) {
  try {
    // TODO: Implement proper HMAC signature verification
    // For now, accept all webhooks (implement proper verification later)
    console.log('🔐 Webhook signature verification (placeholder)');
    return true;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// Update category mapping in PCS AI
async function updateCategoryMapping(accountData) {
  try {
    // TODO: Implement PCS AI category update
    console.log(`📊 Updating category mapping for: ${accountData.Name}`);
    
    // This would update your PCS AI database/cache with the new category info
    // Implementation depends on your data storage setup
    
  } catch (error) {
    console.error('❌ Error updating category mapping:', error);
    throw error;
  }
}

// Update vendor mapping in PCS AI
async function updateVendorMapping(vendorData) {
  try {
    // TODO: Implement PCS AI vendor update
    console.log(`🏢 Updating vendor mapping for: ${vendorData.DisplayName}`);
    
    // This would update your PCS AI database/cache with the new vendor info
    // Implementation depends on your data storage setup
    
  } catch (error) {
    console.error('❌ Error updating vendor mapping:', error);
    throw error;
  }
}

// Update invoice status in PCS AI
async function updateInvoiceStatus(billData) {
  try {
    // TODO: Implement PCS AI invoice status update
    console.log(`💰 Updating invoice status for: ${billData.DocNumber}`);
    
    // This would update your PCS AI database/cache with the new invoice status
    // Implementation depends on your data storage setup
    
  } catch (error) {
    console.error('❌ Error updating invoice status:', error);
    throw error;
  }
}
