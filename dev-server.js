const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const OAuthClient = require('intuit-oauth');

// Load environment variables from env file
dotenv.config({ path: './env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// QuickBooks OAuth Client - Direct implementation for Express server
class QBOAuthClient {
  constructor() {
    this.clientId = process.env.QBO_CLIENT_ID;
    this.clientSecret = process.env.QBO_CLIENT_SECRET;
    this.redirectUri = process.env.QBO_REDIRECT_URI;
    this.environment = process.env.QBO_ENV || 'sandbox';
    this.scopes = process.env.QBO_SCOPES;
    
    // Initialize Intuit OAuth client
    this.oauthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: this.redirectUri,
    });
    
    // Store tokens in memory (in production, use secure storage)
    this.tokens = null;
  }

  getAuthorizationUrl(stateToken = null) {
    try {
      if (!this.clientId || !this.redirectUri || !this.scopes) {
        throw new Error('Missing required environment variables for QBO OAuth');
      }

      // Generate state token if not provided
      const state = stateToken || this.generateStateToken();
      
      // Build authorization URL using Intuit's OAuth client
      const authUrl = this.oauthClient.authorizeUri({
        scope: this.scopes,
        state: state
      });

      console.log('🔗 Generated QuickBooks OAuth URL:', authUrl);
      return authUrl;
      
    } catch (error) {
      console.error('❌ Error generating authorization URL:', error);
      throw error;
    }
  }

  async exchangeCodeForToken(authCode, realmId) {
    try {
      if (!authCode) {
        throw new Error('Authorization code is required');
      }

      console.log('🔄 Exchanging authorization code for access token...');
      console.log('📋 Code:', authCode ? '***' + authCode.slice(-4) : 'none');
      console.log('🏢 Realm ID:', realmId || 'none');

      // Exchange code for tokens using Intuit's OAuth client
      const tokenResponse = await this.oauthClient.createToken(authCode, realmId);
      
      if (tokenResponse.token) {
        // Store tokens
        this.tokens = {
          accessToken: tokenResponse.token.access_token,
          refreshToken: tokenResponse.token.refresh_token,
          expiresIn: tokenResponse.token.expires_in,
          tokenType: tokenResponse.token.token_type,
          realmId: realmId
        };

        console.log('🎉 Successfully obtained access token');
        console.log('🔑 Access Token:', this.tokens.accessToken ? '***' + this.tokens.accessToken.slice(-4) : 'none');
        console.log('🔄 Refresh Token:', this.tokens.refreshToken ? '***' + this.tokens.refreshToken.slice(-4) : 'none');

        return {
          success: true,
          accessToken: this.tokens.accessToken,
          refreshToken: this.tokens.refreshToken,
          expiresIn: this.tokens.expiresIn,
          tokenType: this.tokens.tokenType,
          realmId: realmId
        };
      } else {
        throw new Error('No token received from QuickBooks');
      }

    } catch (error) {
      console.error('❌ Error exchanging code for token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async refreshAccessToken(refreshToken = null) {
    try {
      const token = refreshToken || (this.tokens ? this.tokens.refreshToken : null);
      
      if (!token) {
        throw new Error('Refresh token is required');
      }

      console.log('🔄 Refreshing access token...');

      // Use Intuit's OAuth client to refresh token
      const refreshResponse = await this.oauthClient.refreshUsingToken(token);
      
      if (refreshResponse.token) {
        // Update stored tokens
        this.tokens = {
          accessToken: refreshResponse.token.access_token,
          refreshToken: refreshResponse.token.refresh_token,
          expiresIn: refreshResponse.token.expires_in,
          tokenType: refreshResponse.token.token_type,
          realmId: this.tokens ? this.tokens.realmId : null
        };

        console.log('✅ Access token refreshed successfully');
        return {
          success: true,
          accessToken: this.tokens.accessToken,
          refreshToken: this.tokens.refreshToken,
          expiresIn: this.tokens.expiresIn
        };
      } else {
        throw new Error('No token received during refresh');
      }

    } catch (error) {
      console.error('❌ Error refreshing access token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateStateToken() {
    return 'qbo_oauth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  hasValidTokens() {
    return !!(this.tokens && this.tokens.accessToken);
  }
}

// QuickBooks OAuth Connect Route
app.get('/api/qbo/connect', (req, res) => {
  try {
    const qbClient = new QBOAuthClient();
    
    // Generate authorization URL using the improved OAuth client
    const authUrl = qbClient.getAuthorizationUrl();
    
    console.log('🔗 Redirecting to QuickBooks OAuth:', authUrl);
    
    // Redirect the user to QuickBooks for authorization
    res.redirect(authUrl);
    
  } catch (error) {
    console.error('❌ Error in QBO connect route:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

// QuickBooks OAuth Callback Route
app.get('/api/qbo/callback', async (req, res) => {
  try {
    console.log('🔔 OAuth callback received!');
    console.log('📋 Full URL:', req.url);
    console.log('📋 Query params:', req.query);
    console.log('📋 Headers:', req.headers);
    
    const { code, state, realmId } = req.query;
    
    if (!code) {
      console.error('❌ No authorization code received from QuickBooks');
      return res.status(400).json({ error: 'No authorization code received' });
    }

    console.log('✅ Received authorization code from QuickBooks');
    console.log('📋 Code:', code ? '***' + code.slice(-4) : 'none');
    console.log('🏢 Realm ID:', realmId || 'none');
    console.log('🔒 State:', state || 'none');

    const qbClient = new QBOAuthClient();
    
    // Exchange authorization code for access token using the improved OAuth client
    const tokenResponse = await qbClient.exchangeCodeForToken(code, realmId);
    
    if (tokenResponse.success) {
      console.log('🎉 Successfully obtained access token');
      console.log('🔑 Access Token:', tokenResponse.accessToken ? '***' + tokenResponse.accessToken.slice(-4) : 'none');
      console.log('🔄 Refresh Token:', tokenResponse.refreshToken ? '***' + tokenResponse.refreshToken.slice(-4) : 'none');
      
      // Store tokens securely (you'll want to implement proper storage)
      // For now, we'll just log them and return success
      
      res.json({
        success: true,
        message: 'OAuth flow completed successfully',
        realmId: realmId,
        accessTokenReceived: !!tokenResponse.accessToken,
        refreshTokenReceived: !!tokenResponse.refreshToken
      });
      
    } else {
      console.error('❌ Failed to exchange code for token:', tokenResponse.error);
      res.status(500).json({ error: 'Failed to exchange authorization code for access token' });
    }
    
  } catch (error) {
    console.error('❌ Error in QBO callback route:', error);
    res.status(500).json({ error: 'Failed to process OAuth callback' });
  }
});

// Catch-all OAuth callback route (in case QuickBooks redirects to a different path)
app.get('/qbo/callback', async (req, res) => {
  console.log('🔔 Alternative OAuth callback received at /qbo/callback');
  console.log('📋 Full URL:', req.url);
  console.log('📋 Query params:', req.query);
  
  // Redirect to the main callback route
  res.redirect(`/api/qbo/callback?${new URLSearchParams(req.query).toString()}`);
});

// Root OAuth callback route (in case QuickBooks redirects to root)
app.get('/callback', async (req, res) => {
  console.log('🔔 Root OAuth callback received at /callback');
  console.log('📋 Full URL:', req.url);
  console.log('📋 Query params:', req.query);
  
  // Redirect to the main callback route
  res.redirect(`/api/qbo/callback?${new URLSearchParams(req.query).toString()}`);
});

// Debug route to see what URL QuickBooks is actually redirecting to
app.get('*', (req, res) => {
  if (req.url.includes('code=') || req.url.includes('realmId=')) {
    console.log('🔍 Potential OAuth callback detected at:', req.url);
    console.log('📋 Query params:', req.query);
    console.log('📋 Headers:', req.headers);
    
    // If it looks like an OAuth callback, redirect to the main callback route
    if (req.query.code) {
      return res.redirect(`/api/qbo/callback?${new URLSearchParams(req.query).toString()}`);
    }
  }
  
  // For all other routes, return a helpful message
  res.json({
    message: 'Route not found',
    url: req.url,
    method: req.method,
    query: req.query,
    note: 'If this looks like an OAuth callback, check the server logs for debugging info'
  });
});

// Token exchange function removed - now handled by QBOAuthClient

// API endpoint for updating invoice status
app.post('/update-invoice-status', async (req, res) => {
  try {
    const { invoice_number, status, approved } = req.body;

    if (!invoice_number || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Updating invoice:', { invoice_number, status, approved });

    // Read current queue from the public directory
    const queuePath = path.join(__dirname, 'public', 'invoice_queue.json');
    
    if (!fs.existsSync(queuePath)) {
      console.error('Queue file not found:', queuePath);
      return res.status(404).json({ error: 'Invoice queue not found' });
    }

    const queueData = fs.readFileSync(queuePath, 'utf8');
    const queue = JSON.parse(queueData);

    console.log('Current queue length:', queue.length);

    // Find and update the specific invoice
    let found = false;
    const updatedQueue = queue.map(inv => {
      if (inv.invoice_number === invoice_number) {
        found = true;
        const updated = {
          ...inv,
          status: status,
          ...(approved !== null && approved !== undefined && { approved: approved }),
          timestamp: new Date().toISOString()
        };
        console.log('Updated invoice:', updated);
        return updated;
      }
      return inv;
    });

    if (!found) {
      console.error('Invoice not found:', invoice_number);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Save updated queue to public directory
    fs.writeFileSync(queuePath, JSON.stringify(updatedQueue, null, 2));
    console.log('Queue updated successfully');

    // Also update the root directory version if it exists
    const rootQueuePath = path.join(__dirname, 'invoice_queue.json');
    if (fs.existsSync(rootQueuePath)) {
      fs.writeFileSync(rootQueuePath, JSON.stringify(updatedQueue, null, 2));
      console.log('Root queue also updated');
    }

    res.status(200).json({ 
      success: true, 
      message: `Invoice ${invoice_number} status updated to ${status}`,
      updated_invoice: updatedQueue.find(inv => inv.invoice_number === invoice_number)
    });

  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// API endpoint for removing an invoice entirely and deleting related files
app.post('/remove-invoice', async (req, res) => {
  try {
    const { invoice_number, json_path, pdf_path } = req.body || {};
    if (!invoice_number) {
      return res.status(400).json({ error: 'invoice_number is required' });
    }

    const publicQueuePath = path.join(__dirname, 'public', 'invoice_queue.json');
    const rootQueuePath = path.join(__dirname, 'invoice_queue.json');

    if (!fs.existsSync(publicQueuePath)) {
      return res.status(404).json({ error: 'Invoice queue not found' });
    }

    const queue = JSON.parse(fs.readFileSync(publicQueuePath, 'utf8'));
    const filtered = queue.filter(inv => inv.invoice_number !== invoice_number);
    fs.writeFileSync(publicQueuePath, JSON.stringify(filtered, null, 2));
    if (fs.existsSync(rootQueuePath)) {
      fs.writeFileSync(rootQueuePath, JSON.stringify(filtered, null, 2));
    }

    // Best-effort: remove associated files in both root and public
    const tryUnlink = (p) => {
      if (!p) return;
      const candidates = [
        path.join(__dirname, p),
        path.join(__dirname, 'public', p),
      ];
      for (const filePath of candidates) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
      }
    };

    tryUnlink(json_path);
    tryUnlink(pdf_path);

    res.json({ success: true, invoice_number });
  } catch (error) {
    console.error('Error removing invoice:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// QuickBooks OAuth Test Route
app.get('/api/qbo/test', (req, res) => {
  try {
    console.log('🔍 Testing OAuth client initialization...');
    console.log('📋 Environment variables:');
    console.log('  QBO_ENV:', process.env.QBO_ENV);
    console.log('  QBO_CLIENT_ID:', process.env.QBO_CLIENT_ID ? '***' + process.env.QBO_CLIENT_ID.slice(-4) : 'NOT_SET');
    console.log('  QBO_REDIRECT_URI:', process.env.QBO_REDIRECT_URI);
    console.log('  QBO_SCOPES:', process.env.QBO_SCOPES);
    
    const qbClient = new QBOAuthClient();
    
    res.json({
      message: 'QBO OAuth Client initialized successfully!',
      timestamp: new Date().toISOString(),
      environment: qbClient.environment,
      clientId: qbClient.clientId ? '***' + qbClient.clientId.slice(-4) : 'NOT_SET',
      redirectUri: qbClient.redirectUri || 'NOT_SET',
      scopes: qbClient.scopes || 'NOT_SET',
      hasValidTokens: qbClient.hasValidTokens()
    });
    
  } catch (error) {
    console.error('❌ Error in QBO test route:', error);
    res.status(500).json({ 
      error: 'Failed to test OAuth client',
      details: error.message,
      stack: error.stack
    });
  }
});

// QuickBooks OAuth Refresh Route
app.post('/api/qbo/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const qbClient = new QBOAuthClient();
    
    // Refresh access token using the improved OAuth client
    const refreshResponse = await qbClient.refreshAccessToken(refreshToken);
    
    if (refreshResponse.success) {
      res.json({
        success: true,
        message: 'Access token refreshed successfully',
        accessToken: refreshResponse.accessToken ? '***' + refreshResponse.accessToken.slice(-4) : 'none',
        expiresIn: refreshResponse.expiresIn
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to refresh access token',
        details: refreshResponse.error 
      });
    }
    
  } catch (error) {
    console.error('❌ Error in QBO refresh route:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// NEW: Complete OAuth Endpoint (for manual code exchange)
app.post('/api/qbo/complete-oauth', async (req, res) => {
  try {
    const { authorizationCode } = req.body;
    
    if (!authorizationCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    console.log('🔄 Starting manual OAuth completion...');
    console.log('📋 Code:', authorizationCode ? '***' + authorizationCode.slice(-4) : 'none');

    const qbClient = new QBOAuthClient();
    
    // Exchange authorization code for access token
    const tokenResponse = await qbClient.exchangeCodeForToken(authorizationCode);
    
    if (tokenResponse.success) {
      console.log('🎉 OAuth completed successfully!');
      res.status(200).json({
        success: true,
        message: 'OAuth completed successfully!',
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        realmId: tokenResponse.realmId,
        expiresIn: tokenResponse.expiresIn,
        tokenType: tokenResponse.tokenType
      });
    } else {
      console.error('❌ OAuth completion failed:', tokenResponse.error);
      res.status(500).json({
        error: 'OAuth completion failed',
        details: tokenResponse.error
      });
    }
    
  } catch (error) {
    console.error('❌ OAuth completion error:', error);
    res.status(500).json({
      error: 'Internal server error during OAuth completion',
      details: error.message
    });
  }
});

// NEW: Debug Environment Endpoint
app.get('/api/qbo/debug-env', (req, res) => {
  try {
    console.log('🔍 Debug: Checking environment variables...');
    
    const envVars = {
      QBO_CLIENT_ID: process.env.QBO_CLIENT_ID ? 'SET' : 'NOT SET',
      QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET ? 'SET' : 'NOT SET',
      QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI ? 'SET' : 'NOT SET',
      QBO_ENV: process.env.QBO_ENV || 'NOT SET (defaults to sandbox)',
      QBO_SCOPES: process.env.QBO_SCOPES || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
      PORT: process.env.PORT || '3001 (default)'
    };
    
    console.log('🔍 Environment variables status:', envVars);
    
    res.status(200).json({
      message: 'Environment variables debug info',
      environment: envVars,
      timestamp: new Date().toISOString(),
      note: 'This endpoint shows what environment variables are available to your server'
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug endpoint failed',
      details: error.message
    });
  }
});

// NEW: Simple Test Endpoint
app.get('/api/test', (req, res) => {
  res.json({ ok: true, message: 'Local API server is working!', timestamp: new Date().toISOString() });
});

// NEW: Hello World Endpoint
app.get('/api/hello-world', (req, res) => {
  res.json({ message: 'Hello World!', timestamp: new Date().toISOString() });
});

// NEW: Test Simple Endpoint
app.get('/api/test-simple', (req, res) => {
  res.json({
    message: 'Test simple endpoint working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
});

// NEW: Hello Endpoint
app.get('/api/hello', (req, res) => {
  res.status(200).json({ message: 'API is working!', method: req.method });
});

// NEW: Webhook Test Endpoint
app.get('/api/webhooks/test', (req, res) => {
  console.log('🧪 Test webhook endpoint called');
  console.log('🧪 Method:', req.method);
  console.log('🧪 URL:', req.url);
  
  res.json({
    message: 'Test webhook working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
});

// NEW: QuickBooks Webhook Endpoint
app.get('/api/webhooks/quickbooks', (req, res) => {
  console.log('🔔 QuickBooks webhook endpoint called');
  
  if (req.method === 'GET') {
    console.log('✅ GET request handled successfully');
    res.status(200).send('QuickBooks Webhook Endpoint - Working!');
  } else {
    res.status(405).send('Method Not Allowed');
  }
});

app.post('/api/webhooks/quickbooks', (req, res) => {
  console.log('📋 Processing webhook payload...');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  
  // For now, just acknowledge receipt
  console.log('✅ Webhook received successfully');
  res.status(200).send('OK');
});

// NEW: Sync Categories Endpoint
app.get('/api/qbo/sync-categories', async (req, res) => {
  try {
    console.log('🔄 Syncing QuickBooks categories...');
    
    // For now, return a placeholder response
    res.json({
      message: 'Category sync endpoint working!',
      timestamp: new Date().toISOString(),
      note: 'This would fetch categories from QuickBooks in production'
    });
    
  } catch (error) {
    console.error('❌ Category sync error:', error);
    res.status(500).json({
      error: 'Category sync failed',
      details: error.message
    });
  }
});

// NEW: Local Test Page Route
app.get('/local-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'local-test.html'));
});

// NEW: Send Invoice Endpoint
app.post('/api/qbo/send-invoice', async (req, res) => {
  try {
    const { invoiceData } = req.body;
    
    if (!invoiceData) {
      return res.status(400).json({ error: 'Invoice data is required' });
    }

    console.log('📤 Sending invoice to QuickBooks...');
    console.log('📋 Invoice data:', JSON.stringify(invoiceData, null, 2));
    
    // For now, return a placeholder response
    res.json({
      message: 'Invoice send endpoint working!',
      timestamp: new Date().toISOString(),
      invoiceReceived: true,
      note: 'This would create a bill in QuickBooks in production'
    });
    
  } catch (error) {
    console.error('❌ Invoice send error:', error);
    res.status(500).json({
      error: 'Invoice send failed',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Development API server running on http://localhost:${PORT}`);
  console.log(`🔗 QuickBooks OAuth: http://localhost:${PORT}/api/qbo/connect`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`🔍 Debug endpoint: http://localhost:${PORT}/api/qbo/debug-env`);
}); 