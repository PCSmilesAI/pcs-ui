/**
 * QuickBooks Webhook Endpoint - Simple Test Version
 */

module.exports = (req, res) => {
  console.log('🔔 Webhook endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle GET requests for testing
  if (req.method === 'GET') {
    console.log('✅ GET request handled');
    return res.status(200).send('QuickBooks Webhook Endpoint - Working!');
  }
  
  // Handle POST requests
  if (req.method === 'POST') {
    console.log('✅ POST request handled');
    return res.status(200).send('Webhook received');
  }
  
  // Handle other methods
  return res.status(405).send('Method Not Allowed');
};
