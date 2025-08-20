/**
 * Simple Test Webhook (.js version)
 * Basic endpoint to test webhook routing
 */

module.exports = (req, res) => {
  console.log('🧪 Test webhook endpoint called');
  console.log('🧪 Method:', req.method);
  console.log('🧪 URL:', req.url);
  
  res.json({
    message: 'Test webhook working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
};
