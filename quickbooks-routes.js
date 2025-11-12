const express = require('express');
const router = express.Router();
const OAuthClient = require('intuit-oauth');
const rateLimit = require('express-rate-limit');
const { tokenManager } = require('./database');

// SECURITY: Simple HTML escaping function to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text).replace(/[&<>"']/g, (char) => map[char] || char);
}

// SECURITY: Rate limiting for OAuth flows to prevent DoS attacks
const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes per IP
  message: 'Too many OAuth callback attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const oauthAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes per IP (more lenient for auth initiation)
  message: 'Too many OAuth auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize QuickBooks client
const oauthClient = new OAuthClient({
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    environment: process.env.QB_ENVIRONMENT || 'production',
    redirectUri: process.env.QB_REDIRECT_URI
});

// Start OAuth flow
router.get('/auth', oauthAuthLimiter, (req, res) => {
    const authUri = oauthClient.authorizeUri({
        scope: [
            OAuthClient.scopes.Accounting,
            OAuthClient.scopes.OpenId,
            OAuthClient.scopes.Profile,
            OAuthClient.scopes.Email
        ],
        state: 'intuit-test'
    });
    res.redirect(authUri);
});

// OAuth callback
router.get('/callback', oauthCallbackLimiter, async (req, res) => {
    try {
        const authCode = req.query.code;
        const realmId = req.query.realmId;
        
        if (!authCode) {
            return res.status(400).send('No authorization code provided');
        }

        // Exchange auth code for tokens
        const authResponse = await oauthClient.createToken(req.url);
        
        // Store tokens in database
        const tokens = {
            access_token: authResponse.getJson().access_token,
            refresh_token: authResponse.getJson().refresh_token,
            realmId: realmId,
            expires_at: Date.now() + (authResponse.getJson().expires_in * 1000)
        };
        
        await tokenManager.saveTokens(tokens);
        
        // Redirect to success page
        res.redirect('/success.html?connected=true');
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        // SECURITY: Escape error message to prevent XSS through exception text
        const safeMessage = escapeHtml(error.message || 'Unknown error');
        res.status(500).send('Authentication failed: ' + safeMessage);
    }
});

// Disconnect
router.get('/disconnect', async (req, res) => {
    try {
        const tokenData = await tokenManager.getLatestTokens();
        
        if (tokenData) {
            oauthClient.setToken({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token
            });
            
            await oauthClient.revoke();
            await tokenManager.deleteTokens(tokenData.realm_id);
        }
        
        res.json({ success: true, message: 'Successfully disconnected from QuickBooks' });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get connection status
router.get('/status', async (req, res) => {
    try {
        const hasTokens = await tokenManager.hasTokens();
        res.json({ connected: hasTokens });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
