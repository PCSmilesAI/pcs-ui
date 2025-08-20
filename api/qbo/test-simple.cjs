/**
 * Simple OAuth Test Endpoint
 * Minimal test to see if the basic OAuth endpoint structure works
 */

module.exports = async (req, res) => {
  try {
    console.log('🧪 Simple OAuth test endpoint called');
    
    // Only handle POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('✅ Simple OAuth test successful');
    
    // Return a simple success response
    return res.status(200).json({
      message: 'Simple OAuth test completed successfully!',
      timestamp: new Date().toISOString(),
      note: 'This endpoint works without external API calls or environment variables'
    });
    
  } catch (error) {
    console.error('❌ Simple OAuth test error:', error);
    return res.status(500).json({ 
      error: 'Simple OAuth test failed',
      details: error.message
    });
  }
};
