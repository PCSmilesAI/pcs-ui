/**
 * QuickBooks Webhook Endpoint
 * Handles real-time notifications from QuickBooks for automatic data sync
 */

module.exports = async (req, res) => {
  try {
    console.log('🔔 QuickBooks webhook received');
    
    // Handle GET requests for testing
    if (req.method === 'GET') {
      console.log('✅ GET request handled successfully');
      return res.status(200).send('QuickBooks Webhook Endpoint');
    }
    
    // Handle POST requests for actual webhooks
    if (req.method === 'POST') {
      console.log('📋 Webhook payload received');
      
      // For now, just log and accept all webhooks
      // TODO: Implement proper signature verification
      console.log('✅ Webhook accepted (signature verification disabled for testing)');
      return res.status(200).send('OK');
    }
    
    // Handle other methods
    return res.status(405).send('Method Not Allowed');
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
};
