/**
 * QuickBooks Webhook Endpoint (.js version)
 * Simple webhook handler for testing
 */

module.exports = async (req, res) => {
  try {
    console.log('🔔 QuickBooks webhook received');
    
    // Handle GET requests for testing
    if (req.method === 'GET') {
      console.log('✅ GET request handled successfully');
      return res.status(200).send('QuickBooks Webhook Endpoint - Working!');
    }
    
    // Handle POST requests for actual webhooks
    if (req.method === 'POST') {
      console.log('📋 Processing webhook payload...');
      console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
      console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
      
      // For now, just acknowledge receipt
      console.log('✅ Webhook received successfully');
      return res.status(200).send('OK');
    }
    
    // Handle other methods
    return res.status(405).send('Method Not Allowed');
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
};
