/**
 * Simple Test Endpoint (.js version)
 * Test if basic API routing works
 */

module.exports = (req, res) => {
  console.log('🧪 Simple test endpoint called');
  
  res.json({
    message: 'Simple test endpoint working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
};
