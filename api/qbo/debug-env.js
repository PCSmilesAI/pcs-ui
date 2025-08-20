/**
 * Debug Environment Variables (.js version)
 * Check what environment variables are available in the Vercel environment
 */

module.exports = async (req, res) => {
  try {
    console.log('🔍 Debug: Checking environment variables...');
    
    const envVars = {
      QBO_CLIENT_ID: process.env.QBO_CLIENT_ID ? 'SET' : 'NOT SET',
      QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET ? 'SET' : 'NOT SET',
      QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI ? 'SET' : 'NOT SET',
      QBO_ENV: process.env.QBO_ENV || 'NOT SET (defaults to sandbox)',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
      VERCEL_ENV: process.env.VERCEL_ENV || 'NOT SET'
    };
    
    console.log('🔍 Environment variables status:', envVars);
    
    return res.status(200).json({
      message: 'Environment variables debug info',
      environment: envVars,
      timestamp: new Date().toISOString(),
      note: 'This endpoint shows what environment variables are available to your serverless functions'
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return res.status(500).json({
      error: 'Debug endpoint failed',
      details: error.message
    });
  }
};
