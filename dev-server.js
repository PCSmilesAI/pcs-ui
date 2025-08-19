import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OAuthClient from 'intuit-oauth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from env file
dotenv.config({ path: './env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
}); 