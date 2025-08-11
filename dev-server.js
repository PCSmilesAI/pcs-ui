import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from env file
dotenv.config({ path: path.join(__dirname, 'env') });

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// QuickBooks OAuth Connect Route
app.get('/api/qbo/connect', (req, res) => {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    const qboEnv = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !redirectUri || !scopes) {
      console.error('❌ Missing required environment variables for QBO OAuth');
      return res.status(500).json({ error: 'Missing required environment variables' });
    }

    // Determine the base URL based on environment
    const baseUrl = qboEnv === 'sandbox' 
      ? 'https://sandbox-accounts.platform.intuit.com'
      : 'https://accounts.platform.intuit.com';

    // Build the OAuth authorization URL
    const authUrl = new URL('/oauth2/v1/authorizations/request', baseUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', 'qbo_oauth_' + Date.now()); // Simple state for CSRF protection

    console.log('🔗 Redirecting to QuickBooks OAuth:', authUrl.toString());
    
    // Redirect the user to QuickBooks for authorization
    res.redirect(authUrl.toString());
    
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

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code, realmId);
    
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

async function exchangeCodeForToken(authorizationCode, realmId) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const qboEnv = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing required environment variables for token exchange');
    }

    // Determine the token endpoint based on environment
    const tokenEndpoint = qboEnv === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri
    });

    console.log('🔄 Exchanging authorization code for access token...');
    
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: tokenRequestBody.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    return {
      success: true,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type
    };
    
  } catch (error) {
    console.error('❌ Error in token exchange:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

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

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
}); 