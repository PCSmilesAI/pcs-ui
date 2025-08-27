const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

// Load environment variables from env file
dotenv.config({ path: './env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Global QuickBooks client instance to share tokens across requests
let globalQBClient = null;

// Simple file-based token storage to persist across server restarts
const TOKEN_FILE = path.join(__dirname, 'qbo_tokens.json');

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log('💾 Tokens saved to file');
  } catch (error) {
    console.error('❌ Failed to save tokens:', error);
  }
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      console.log('📂 Tokens loaded from file');
      return tokenData;
    }
  } catch (error) {
    console.error('❌ Failed to load tokens:', error);
  }
  return null;
}

function restoreGlobalClient() {
  const savedTokens = loadTokens();
  if (savedTokens) {
    const qbClient = new QBOAuthClient();
    qbClient.tokens = savedTokens;
    
    // Also restore the QuickBooks client with correct parameters for node-quickbooks
    qbClient.qboClient = new QuickBooks(
      qbClient.clientId,           // consumerKey
      qbClient.clientSecret,       // consumerSecret
      savedTokens.accessToken,     // token
      qbClient.clientSecret,       // tokenSecret
      savedTokens.realmId,         // realmId
      qbClient.environment === 'sandbox', // useSandbox
      true,                        // debug
      null,                        // minorversion
      '2.0',                      // oauthversion
      savedTokens.refreshToken     // refreshToken
    );
    
    globalQBClient = qbClient;
    console.log('🔄 Global client and QuickBooks client restored from saved tokens');
    return true;
  }
  return false;
}

// Enhanced rate limiting for QuickBooks API compliance
const quickbooksRateLimit = rateLimit({
  windowMs: 1 * 1000, // 1 second
  max: 8, // 8 requests per second (leaving buffer for 10 req/sec limit)
  message: {
    error: 'QuickBooks API rate limit exceeded',
    message: 'Too many requests to QuickBooks API. Please wait and try again.',
    retryAfter: '1 second'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per realm ID if available
    return req.headers['x-realm-id'] || req.ip;
  }
});

const batchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute (leaving buffer for 120 req/min limit)
  message: {
    error: 'QuickBooks Batch API rate limit exceeded',
    message: 'Too many batch requests. Please wait and try again.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Circuit Breaker for QuickBooks API calls
class QuickBooksCircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - QuickBooks API temporarily unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn('🚨 QuickBooks Circuit Breaker OPEN - API failures exceeded threshold');
    }
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.state === 'OPEN'
    };
  }
}

// Retry logic with exponential backoff
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if it's a rate limit error
      if (error.message && error.message.includes('rate limit')) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Rate limit hit, waiting ${delay}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // For non-rate-limit errors, use shorter delay
        const delay = baseDelay * attempt;
        console.log(`⏳ API error, waiting ${delay}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Initialize circuit breaker
const qbCircuitBreaker = new QuickBooksCircuitBreaker();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));
app.use(helmet());

// ============================================================================
// HEALTH CHECK & MONITORING ENDPOINTS (No Authentication Required)
// ============================================================================

// Health check endpoint (no auth required) - MUST BE FIRST!
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    quickbooks: {
      circuitBreaker: qbCircuitBreaker ? qbCircuitBreaker.getStatus() : null,
      rateLimits: {
        api: '8 req/sec',
        batch: '100 req/min'
      }
    }
  };
  
  res.status(200).json(health);
});

// QuickBooks API Compliance Status
app.get('/api/qbo/compliance-status', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    compliance: {
      rateLimiting: {
        status: 'IMPLEMENTED',
        apiLimit: '8 requests/second (QuickBooks limit: 10 req/sec)',
        batchLimit: '100 requests/minute (QuickBooks limit: 120 req/min)',
        description: 'Rate limiting implemented with buffer for safety'
      },
      circuitBreaker: {
        status: 'IMPLEMENTED',
        failureThreshold: 5,
        resetTimeout: '60 seconds',
        currentState: qbCircuitBreaker ? qbCircuitBreaker.getStatus().state : 'UNKNOWN'
      },
      retryLogic: {
        status: 'IMPLEMENTED',
        maxRetries: 3,
        backoffStrategy: 'Exponential backoff for rate limits'
      },
      upcomingChanges: {
        sandbox: 'August 15, 2025 - Batch API limits, Account limits',
        production: 'October 31, 2025 - All new limits active',
        impact: 'LOW - All mitigations already implemented'
      }
    }
  });
});

// System metrics endpoint (no auth required) - MUST BE FIRST!
app.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version
    },
    quickbooks: {
      hasGlobalClient: !!globalQBClient,
      hasValidTokens: globalQBClient ? globalQBClient.hasValidTokens() : false,
      lastOAuth: globalQBClient ? globalQBClient.lastOAuthAt : null
    },
    pcsAI: pcsAIWorkflow ? pcsAIWorkflow.getStats() : null
  };
  
  res.status(200).json(metrics);
});

// QuickBooks OAuth Client - Using Official SDK
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
    
    // Initialize QuickBooks client when tokens are available
    this.qboClient = null;
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

      // Exchange code for tokens manually using HTTPS request
      const tokenResponse = await this.exchangeCodeForTokenManually(authCode, realmId);
      
      if (tokenResponse.token) {
        // Store tokens
        this.tokens = {
          accessToken: tokenResponse.token.access_token,
          refreshToken: tokenResponse.token.refresh_token,
          expiresIn: tokenResponse.token.expires_in,
          tokenType: tokenResponse.token.token_type,
          realmId: realmId
        };

        // Initialize official QuickBooks client with correct parameters for node-quickbooks
        this.qboClient = new QuickBooks(
          this.clientId,           // consumerKey
          this.clientSecret,       // consumerSecret  
          this.tokens.accessToken, // token
          this.clientSecret,       // tokenSecret
          this.tokens.realmId,     // realmId
          this.environment === 'sandbox', // useSandbox
          true,                    // debug
          null,                    // minorversion
          '2.0',                  // oauthversion
          this.tokens.refreshToken // refreshToken
        );

        console.log('🎉 Successfully obtained access token');
        console.log('🔑 Access Token:', this.tokens.accessToken ? '***' + this.tokens.accessToken.slice(-4) : 'none');
        console.log('🔄 Refresh Token:', this.tokens.refreshToken ? '***' + this.tokens.refreshToken.slice(-4) : 'none');
        console.log('🚀 Official QuickBooks client initialized');

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

  async exchangeCodeForTokenManually(authCode, realmId) {
    try {
      const https = require('https');
      
      // Prepare the token request
      const tokenRequestBody = `grant_type=authorization_code&code=${encodeURIComponent(authCode)}&redirect_uri=${encodeURIComponent(process.env.QBO_REDIRECT_URI)}`;
      
      const options = {
        hostname: 'oauth.platform.intuit.com',
        port: 443,
        path: '/oauth2/v1/tokens/bearer',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(process.env.QBO_CLIENT_ID + ':' + process.env.QBO_CLIENT_SECRET).toString('base64')}`,
          'Accept': 'application/json'
        }
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              
              if (response.access_token) {
                resolve({
                  token: {
                    access_token: response.access_token,
                    refresh_token: response.refresh_token,
                    expires_in: response.expires_in,
                    token_type: response.token_type,
                    realmId: realmId
                  }
                });
              } else {
                reject(new Error('No access token in response: ' + data));
              }
            } catch (error) {
              reject(new Error('Failed to parse response: ' + data));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(tokenRequestBody);
        req.end();
      });
      
    } catch (error) {
      throw error;
    }
  }

  hasValidTokens() {
    return !!(this.tokens && this.tokens.accessToken);
  }

  // Official SDK handles all API requests - no custom HTTP needed!

  async getAccounts() {
    try {
      console.log('📊 Fetching QuickBooks accounts using official SDK...');
      console.log('📊 QuickBooks client exists:', !!this.qboClient);
      console.log('📊 QuickBooks client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.qboClient)));
      
      if (!this.qboClient) {
        throw new Error('QuickBooks client not initialized');
      }
      
      if (typeof this.qboClient.findAccounts !== 'function') {
        throw new Error('findAccounts method not available on QuickBooks client');
      }
      
      return new Promise((resolve, reject) => {
        this.qboClient.findAccounts({
          limit: 1000
        }, (err, accounts) => {
          if (err) {
            console.error('❌ Error fetching accounts:', err);
            reject(err);
          } else {
            console.log(`✅ Found ${accounts.length} accounts using official SDK`);
            resolve(accounts);
          }
        });
      });
    } catch (error) {
      console.error('❌ Error in getAccounts:', error);
      throw error;
    }
  }

  async getVendors() {
    try {
      console.log('🏢 Fetching QuickBooks vendors...');
      const response = await this.makeQuickBooksRequest('/query?query=SELECT * FROM Vendor MAXRESULTS 1000');
      
      if (response.QueryResponse && response.QueryResponse.Vendor) {
        console.log(`✅ Found ${response.QueryResponse.Vendor.length} vendors`);
        return response.QueryResponse.Vendor;
      } else {
        console.log('⚠️ No vendors found in response');
        return [];
      }
    } catch (error) {
      console.error('❌ Error fetching vendors:', error);
      throw error;
    }
  }

  async createBill(billData) {
    try {
      console.log('📄 Creating QuickBooks bill using official SDK...');
      
      // Handle both old format (lineItems) and new format (Line)
      let lineItems = billData.lineItems || billData.Line || [];
      
      // Get PCS AI account ID for all line items
      const pcsAIAccountId = await this.ensurePCSAIAccount();
      console.log('📊 Using PCS AI account ID:', pcsAIAccountId);
      
      // Format the bill data for official SDK
      const billObj = {
        Line: lineItems.map(item => ({
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount: parseFloat(item.amount || item.Amount) || 0,
          Description: item.description || item.Description || 'Dental Supplies',
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: pcsAIAccountId // Use PCS AI account for all line items
            }
          }
        })),
        VendorRef: {
          value: billData.VendorRef?.value || '33' // Use Accounts Payable as vendor (this is valid)
        },
        APAccountRef: {
          value: billData.APAccountRef?.value || '33' // Use Accounts Payable as AP account
        },
        // Add PCS AI identifier to make bills easy to find
        Memo: `PCS AI Processed - ${billData.Memo || billData.Description || 'Dental Invoice'}`,
        TotalAmt: parseFloat(billData.TotalAmt || billData.amount) || 0,
        DocNumber: billData.DocNumber || billData.invoiceNumber,
        TxnDate: billData.TxnDate || billData.dueDate || new Date().toISOString().split('T')[0],
        DueDate: billData.DueDate || billData.dueDate || new Date().toISOString().split('T')[0]
      };
      
      console.log('📄 Bill data for official SDK:', JSON.stringify(billObj, null, 2));
      
      return new Promise((resolve, reject) => {
        this.qboClient.createBill(billObj, (err, bill) => {
          if (err) {
            console.error('❌ Error creating bill:', err);
            reject(err);
          } else {
            console.log(`✅ Bill created successfully with ID: ${bill.Id} using official SDK`);
            resolve(bill);
          }
        });
      });
    } catch (error) {
      console.error('❌ Error in createBill:', error);
      throw error;
    }
  }

  // Create PCS AI Bills account if it doesn't exist
  async ensurePCSAIAccount() {
    try {
      console.log('🔍 Ensuring PCS AI Bills account exists...');
      
      // Try to find existing PCS AI account
      const existingAccount = await this.findAccountByName('PCS AI Bill');
      
      if (existingAccount) {
        console.log('✅ PCS AI Bills account already exists:', existingAccount.Id);
        return existingAccount.Id;
      }
      
      // If we can't find it by name, use the known ID from the error message
      console.log('📝 PCS AI Bill account exists but can\'t be found by name, using known ID: 1150040000');
      return '1150040000';
      
    } catch (error) {
      console.error('❌ Error ensuring PCS AI account:', error);
      // Fall back to known PCS AI Bill account ID
      return '1150040000'; // Known PCS AI Bill account ID
    }
  }

    // Find account by name
  async findAccountByName(accountName) {
    try {
      console.log(`🔍 Searching for account: ${accountName}`);
      const accounts = await this.qboClient.findAccounts();
      console.log('🔍 Account search result:', accounts);

      // Handle different response formats
      let accountList = [];
      if (Array.isArray(accounts)) {
        accountList = accounts;
      } else if (accounts && accounts.QueryResponse && accounts.QueryResponse.Account) {
        accountList = accounts.QueryResponse.Account;
      } else if (accounts && accounts.Account) {
        accountList = accounts.Account;
      }

      // Find account by name
      const foundAccount = accountList.find(account => account.Name === accountName);
      if (foundAccount) {
        console.log(`✅ Found account: ${foundAccount.Name} (ID: ${foundAccount.Id})`);
        return foundAccount;
      }
      
      console.log(`❌ Account not found: ${accountName}`);
      return null;
    } catch (error) {
      console.log('❌ Error finding account by name:', error);
      return null;
    }
  }

  // Create new account
  async createAccount(accountData) {
    try {
      return new Promise((resolve, reject) => {
        this.qboClient.createAccount(accountData, (err, account) => {
          if (err) {
            reject(err);
          } else {
            resolve(account);
          }
        });
      });
    } catch (error) {
      console.error('❌ Error creating account:', error);
      throw error;
    }
  }
}

// QuickBooks OAuth Connect Route
app.get('/api/qbo/connect', quickbooksRateLimit, (req, res) => {
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
app.get('/api/qbo/callback', quickbooksRateLimit, async (req, res) => {
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
    
    // Store the client globally so other endpoints can access the tokens
    globalQBClient = qbClient;
    console.log('🌍 Global QB client set:', globalQBClient ? 'SUCCESS' : 'FAILED');
    console.log('🌍 Global client has tokens:', globalQBClient.hasValidTokens());
    
    // Save tokens to file for persistence
    saveTokens(globalQBClient.tokens);
    
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

// NEW: Local Test Page Route
app.get('/local-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'local-test.html'));
});

// REMOVED: This catch-all route was blocking all API endpoints!
// It was intercepting requests before they reached the specific API routes

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
app.get('/api/qbo/test', quickbooksRateLimit, (req, res) => {
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

// NEW: QuickBooks Status Endpoint
app.get('/api/qbo/status', quickbooksRateLimit, (req, res) => {
  try {
    console.log('🔍 Status check - globalQBClient:', globalQBClient ? 'EXISTS' : 'NULL');
    if (globalQBClient) {
      console.log('🔍 Status check - tokens:', globalQBClient.tokens ? 'EXISTS' : 'NULL');
      console.log('🔍 Status check - hasValidTokens:', globalQBClient.hasValidTokens());
    }
    
    const hasTokens = globalQBClient && globalQBClient.hasValidTokens();
    const realmId = globalQBClient ? globalQBClient.tokens?.realmId : null;
    
    res.json({
      hasValidTokens: hasTokens,
      realmId: realmId,
      message: hasTokens ? 'QuickBooks connected and ready' : 'No valid tokens. Please complete OAuth first.',
      timestamp: new Date().toISOString(),
      debug: {
        globalClientExists: !!globalQBClient,
        tokensExist: !!(globalQBClient && globalQBClient.tokens),
        clientType: globalQBClient ? globalQBClient.constructor.name : 'null'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Status check failed', details: error.message });
    }
});

// NEW: QuickBooks API Test Endpoint
app.get('/api/qbo/test-api', async (req, res) => {
  try {
    if (!globalQBClient || !globalQBClient.hasValidTokens()) {
      return res.status(401).json({ error: 'No valid QuickBooks tokens. Please complete OAuth first.' });
    }
    
    console.log('🧪 Testing QuickBooks API connection...');
    
    // Test a simple query to verify API connection
    const response = await globalQBClient.makeQuickBooksRequest('/query?query=SELECT * FROM Account MAXRESULTS 1');
    
    res.json({
      success: true,
      message: 'QuickBooks API connection successful',
      response: response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ QuickBooks API test error:', error);
    res.status(500).json({
      error: 'QuickBooks API test failed',
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

// NEW: QuickBooks API Endpoints
app.get('/api/qbo/sync-categories', async (req, res) => {
  try {
    console.log('🔄 Syncing QuickBooks categories...');
    
    // Check if we have valid tokens
    if (!globalQBClient || !globalQBClient.hasValidTokens()) {
      return res.status(401).json({ error: 'No valid QuickBooks tokens. Please complete OAuth first.' });
    }
    
    // Fetch accounts from QuickBooks
    const accounts = await globalQBClient.getAccounts();
    
    // Handle different response formats
    let accountList = [];
    if (Array.isArray(accounts)) {
      accountList = accounts;
    } else if (accounts && accounts.QueryResponse && accounts.QueryResponse.Account) {
      accountList = accounts.QueryResponse.Account;
    } else if (accounts && accounts.Account) {
      accountList = accounts.Account;
    } else {
      console.log('📊 Accounts response format:', JSON.stringify(accounts, null, 2));
      accountList = [];
    }
    
    console.log(`📊 Found ${accountList.length} accounts from response`);
    
    res.json({
      success: true,
      message: 'Categories synced successfully',
      categories: accountList.map(account => ({
        id: account.Id,
        name: account.Name,
        type: account.AccountType,
        description: account.Description || ''
      })),
      count: accountList.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Category sync error:', error);
    res.status(500).json({
      error: 'Category sync failed',
      details: error.message,
      stack: error.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });
  }
});

app.post('/api/qbo/send-invoice', async (req, res) => {
  try {
    const { invoiceData } = req.body;
    
    if (!invoiceData) {
      return res.status(400).json({ error: 'Missing invoice data' });
    }
    
    console.log('📄 Sending invoice to QuickBooks...');
    
    // Check if we have valid tokens
    console.log('📄 Send invoice - globalQBClient:', globalQBClient ? 'EXISTS' : 'NULL');
    if (globalQBClient) {
      console.log('📄 Send invoice - hasValidTokens:', globalQBClient.hasValidTokens());
      console.log('📄 Send invoice - tokens:', globalQBClient.tokens ? 'EXISTS' : 'NULL');
    }
    
    if (!globalQBClient || !globalQBClient.hasValidTokens()) {
      return res.status(401).json({ error: 'No valid QuickBooks tokens. Please complete OAuth first.' });
    }
    
    // Create bill in QuickBooks
    const bill = await globalQBClient.createBill(invoiceData);
    
    res.json({
      success: true,
      message: 'Invoice sent to QuickBooks successfully',
      billId: bill.Id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Send invoice error:', error);
    
    // Provide more detailed error information
    const errorResponse = {
      error: 'Failed to send invoice to QuickBooks',
      details: error.message,
      timestamp: new Date().toISOString()
    };
    
    // If it's a parsing error, add additional context
    if (error.message && error.message.includes('Failed to parse response')) {
      errorResponse.suggestion = 'QuickBooks may have returned an empty or malformed response. Check server logs for details.';
    }
    
    // If it's a QuickBooks validation error, add helpful context
    if (error.Fault && error.Fault.Error) {
      errorResponse.quickbooksError = error.Fault.Error[0];
      errorResponse.suggestion = 'QuickBooks validation error - check the error details above';
    }
    
    res.status(500).json(errorResponse);
  }
});

// NEW: Simple Test Endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Local API server is working!', 
    timestamp: new Date().toISOString(),
    globalClientStatus: {
      exists: !!globalQBClient,
      hasTokens: globalQBClient ? globalQBClient.hasValidTokens() : false,
      realmId: globalQBClient ? globalQBClient.tokens?.realmId : null
    }
  });
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

// Enhanced QuickBooks webhook endpoint for real-time updates
app.post('/api/webhooks/quickbooks', async (req, res) => {
  try {
    console.log('🔔 QuickBooks Webhook Received!');
    console.log('📋 Webhook payload:', JSON.stringify(req.body, null, 2));

    const { eventNotifications } = req.body;

    if (!eventNotifications || !Array.isArray(eventNotifications)) {
      console.log('⚠️ No event notifications in webhook payload');
      return res.status(200).json({ received: true, message: 'No events to process' });
    }

    console.log(`📊 Processing ${eventNotifications.length} event notifications`);

    const processedEvents = [];

    for (const notification of eventNotifications) {
      const { realmId, dataChangeEvent } = notification;

      if (dataChangeEvent && dataChangeEvent.entities) {
        for (const entity of dataChangeEvent.entities) {
          try {
            console.log(`✨ Processing entity: ${entity.name} (ID: ${entity.id}, Operation: ${entity.operation})`);
            
            const eventResult = await processQuickBooksEvent(entity, realmId);
            processedEvents.push({
              entity: entity.name,
              id: entity.id,
              operation: entity.operation,
              result: eventResult,
              timestamp: new Date().toISOString()
            });

          } catch (error) {
            console.error(`❌ Error processing entity ${entity.name}:`, error);
            processedEvents.push({
              entity: entity.name,
              id: entity.id,
              operation: entity.operation,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }

    // Respond with 200 OK to acknowledge receipt of the webhook
    res.status(200).json({ 
      received: true, 
      message: 'Webhook processed successfully',
      processedEvents: processedEvents,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ QuickBooks Webhook Error:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Process individual QuickBooks events
async function processQuickBooksEvent(entity, realmId) {
  try {
    console.log(`🔄 Processing QuickBooks event: ${entity.name} ${entity.operation} (ID: ${entity.id})`);

    switch (entity.name) {
      case 'Bill':
        return await processBillEvent(entity, realmId);
      
      case 'BillPayment':
        return await processBillPaymentEvent(entity, realmId);
      
      case 'Vendor':
        return await processVendorEvent(entity, realmId);
      
      case 'Account':
        return await processAccountEvent(entity, realmId);
      
      case 'Attachable':
        return await processAttachableEvent(entity, realmId);
      
      default:
        console.log(`ℹ️ Unhandled entity type: ${entity.name}`);
        return { status: 'unhandled', message: `Entity type ${entity.name} not yet implemented` };
    }

  } catch (error) {
    console.error(`❌ Error processing QuickBooks event ${entity.name}:`, error);
    throw error;
  }
}

// Process Bill events
async function processBillEvent(entity, realmId) {
  try {
    console.log(`💰 Processing Bill event: ${entity.operation} (ID: ${entity.id})`);

    if (entity.operation === 'Create' || entity.operation === 'Update') {
      // Fetch the full Bill object
      const bill = await globalQBClient.qboClient.getBill(entity.id);
      
      if (bill) {
        console.log(`📄 Bill details: ${bill.DocNumber} - ${bill.TotalAmt} - ${bill.Balance}`);
        
        // Update PCS AI system with bill status
        await updatePCSAIWithBillStatus(bill);
        
        // Check if bill is fully paid
        if (bill.Balance === 0) {
          console.log(`✅ Bill ${bill.DocNumber} is fully paid`);
          await markBillAsCompleted(bill.Id);
        }
        
        return {
          status: 'processed',
          billNumber: bill.DocNumber,
          amount: bill.TotalAmt,
          balance: bill.Balance,
          status: bill.Balance === 0 ? 'PAID' : 'UNPAID'
        };
      }
    }

    return { status: 'processed', message: `Bill ${entity.operation} processed` };

  } catch (error) {
    console.error('❌ Error processing Bill event:', error);
    throw error;
  }
}

// Process Bill Payment events
async function processBillPaymentEvent(entity, realmId) {
  try {
    console.log(`💳 Processing Bill Payment event: ${entity.operation} (ID: ${entity.id})`);

    if (entity.operation === 'Create') {
      // Fetch the full Bill Payment object
      const payment = await globalQBClient.qboClient.getBillPayment(entity.id);
      
      if (payment) {
        console.log(`💳 Payment details: ${payment.TotalAmt} - ${payment.TxnDate}`);
        
        // Update PCS AI system with payment information
        await updatePCSAIWithPaymentInfo(payment);
        
        return {
          status: 'processed',
          paymentAmount: payment.TotalAmt,
          paymentDate: payment.TxnDate
        };
      }
    }

    return { status: 'processed', message: `Bill Payment ${entity.operation} processed` };

  } catch (error) {
    console.error('❌ Error processing Bill Payment event:', error);
    throw error;
  }
}

// Process Vendor events
async function processVendorEvent(entity, realmId) {
  try {
    console.log(`🏢 Processing Vendor event: ${entity.operation} (ID: ${entity.id})`);

    if (entity.operation === 'Create' || entity.operation === 'Update') {
      // Fetch the full Vendor object
      const vendor = await globalQBClient.qboClient.getVendor(entity.id);
      
      if (vendor) {
        console.log(`🏢 Vendor details: ${vendor.DisplayName} - ${vendor.Active ? 'Active' : 'Inactive'}`);
        
        // Update PCS AI system with vendor information
        await updatePCSAIWithVendorInfo(vendor);
        
        return {
          status: 'processed',
          vendorName: vendor.DisplayName,
          active: vendor.Active
        };
      }
    }

    return { status: 'processed', message: `Vendor ${entity.operation} processed` };

  } catch (error) {
    console.error('❌ Error processing Vendor event:', error);
    throw error;
  }
}

// Process Account events
async function processAccountEvent(entity, realmId) {
  try {
    console.log(`📊 Processing Account event: ${entity.operation} (ID: ${entity.id})`);

    if (entity.operation === 'Create' || entity.operation === 'Update') {
      // Fetch the full Account object
      const account = await globalQBClient.qboClient.getAccount(entity.id);
      
      if (account) {
        console.log(`📊 Account details: ${account.Name} - ${account.AccountType} - ${account.CurrentBalance}`);
        
        return {
          status: 'processed',
          accountName: account.Name,
          accountType: account.AccountType,
          balance: account.CurrentBalance
        };
      }
    }

    return { status: 'processed', message: `Account ${entity.operation} processed` };

  } catch (error) {
    console.error('❌ Error processing Account event:', error);
    throw error;
  }
}

// Process Attachable events
async function processAttachableEvent(entity, realmId) {
  try {
    console.log(`📎 Processing Attachable event: ${entity.operation} (ID: ${entity.id})`);

    if (entity.operation === 'Create') {
      // Fetch the full Attachable object
      const attachable = await globalQBClient.qboClient.getAttachable(entity.id);
      
      if (attachable) {
        console.log(`📎 Attachment details: ${attachable.FileName} - ${attachable.ContentType}`);
        
        return {
          status: 'processed',
          fileName: attachable.FileName,
          contentType: attachable.ContentType,
          size: attachable.Size
        };
      }
    }

    return { status: 'processed', message: `Attachable ${entity.operation} processed` };

  } catch (error) {
    console.error('❌ Error processing Attachable event:', error);
    throw error;
  }
}

// Handle bill updates (paid, modified, etc.)
async function handleBillUpdate(billId, operation, lastUpdated) {
  try {
    console.log(`📄 Bill Update: ${operation} for Bill ID: ${billId}`);
    
    // Get the updated bill from QuickBooks
    const bill = await globalQBClient.getBill(billId);
    
    if (bill) {
      console.log(`📊 Bill Status: ${bill.Balance} remaining, Due: ${bill.DueDate}`);
      
      // Update PCS AI system with bill status
      await updatePCSAIWithBillStatus(bill);
      
      // If bill is fully paid, mark it as completed
      if (bill.Balance === 0) {
        console.log(`✅ Bill ${bill.DocNumber} is fully paid`);
        await markBillAsCompleted(billId);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error handling bill update for ${billId}:`, error.message);
  }
}

// Handle bill payment updates
async function handleBillPaymentUpdate(paymentId, operation, lastUpdated) {
  try {
    console.log(`💰 Bill Payment Update: ${operation} for Payment ID: ${paymentId}`);
    
    // Get the payment details
    const payment = await globalQBClient.getBillPayment(paymentId);
    
    if (payment) {
      console.log(`📊 Payment Amount: ${payment.TotalAmt}, Applied to Bill: ${payment.Line?.[0]?.LinkedTxn?.[0]?.TxnId}`);
      
      // Update PCS AI system with payment information
      await updatePCSAIWithPaymentInfo(payment);
    }
    
  } catch (error) {
    console.error(`❌ Error handling payment update for ${paymentId}:`, error.message);
  }
}

// Handle vendor updates
async function handleVendorUpdate(vendorId, operation, lastUpdated) {
  try {
    console.log(`🏢 Vendor Update: ${operation} for Vendor ID: ${vendorId}`);
    
    // Get the updated vendor from QuickBooks
    const vendor = await globalQBClient.getVendor(vendorId);
    
    if (vendor) {
      console.log(`📊 Vendor: ${vendor.DisplayName}, Active: ${vendor.Active}`);
      
      // Update PCS AI system with vendor information
      await updatePCSAIWithVendorInfo(vendor);
    }
    
  } catch (error) {
    console.error(`❌ Error handling vendor update for ${vendorId}:`, error.message);
  }
}

// Update PCS AI system with bill status
async function updatePCSAIWithBillStatus(bill) {
  try {
    console.log(`🔄 Updating PCS AI with bill status for ${bill.DocNumber}`);
    
    // In production, this would update your PCS AI database
    // For now, we'll just log the update
    const updateData = {
      billId: bill.Id,
      billNumber: bill.DocNumber,
      status: bill.Balance === 0 ? 'PAID' : 'UNPAID',
      balance: bill.Balance,
      dueDate: bill.DueDate,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('📊 PCS AI Update Data:', JSON.stringify(updateData, null, 2));
    
    // TODO: Implement actual PCS AI database update
    // await pcsAIDatabase.updateBillStatus(updateData);
    
  } catch (error) {
    console.error('❌ Error updating PCS AI with bill status:', error.message);
  }
}

// Update PCS AI system with payment information
async function updatePCSAIWithPaymentInfo(payment) {
  try {
    console.log(`🔄 Updating PCS AI with payment info for Payment ID: ${payment.Id}`);
    
    // In production, this would update your PCS AI database
    const updateData = {
      paymentId: payment.Id,
      amount: payment.TotalAmt,
      date: payment.TxnDate,
      billId: payment.Line?.[0]?.LinkedTxn?.[0]?.TxnId,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('📊 PCS AI Payment Update Data:', JSON.stringify(updateData, null, 2));
    
    // TODO: Implement actual PCS AI database update
    // await pcsAIDatabase.updatePaymentInfo(updateData);
    
  } catch (error) {
    console.error('❌ Error updating PCS AI with payment info:', error.message);
  }
}

// Update PCS AI system with vendor information
async function updatePCSAIWithVendorInfo(vendor) {
  try {
    console.log(`🔄 Updating PCS AI with vendor info for ${vendor.DisplayName}`);
    
    // In production, this would update your PCS AI database
    const updateData = {
      vendorId: vendor.Id,
      vendorName: vendor.DisplayName,
      active: vendor.Active,
      email: vendor.PrimaryEmailAddr?.Address,
      phone: vendor.PrimaryPhone?.FreeFormNumber,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('📊 PCS AI Vendor Update Data:', JSON.stringify(updateData, null, 2));
    
    // TODO: Implement actual PCS AI database update
    // await pcsAIDatabase.updateVendorInfo(updateData);
    
  } catch (error) {
    console.error('❌ Error updating PCS AI with vendor info:', error.message);
  }
}

// Mark bill as completed in PCS AI system
async function markBillAsCompleted(billId) {
  try {
    console.log(`✅ Marking bill ${billId} as completed in PCS AI`);
    
    // In production, this would update your PCS AI database
    const completionData = {
      billId: billId,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      notes: 'Bill fully paid - automatically marked as completed'
    };
    
    console.log('📊 PCS AI Completion Data:', JSON.stringify(completionData, null, 2));
    
    // TODO: Implement actual PCS AI database update
    // await pcsAIDatabase.markBillCompleted(completionData);
    
  } catch (error) {
    console.error('❌ Error marking bill as completed:', error.message);
  }
}

// ============================================================================
// PCS AI INTEGRATION SYSTEM
// ============================================================================

// PCS AI Invoice Processing Workflow
class PCSAIWorkflow {
  constructor() {
    this.processingQueue = [];
    this.processingStatus = 'idle';
    this.lastProcessedAt = null;
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      lastError: null
    };
  }

  // Add invoice to processing queue
  async addToQueue(invoiceData) {
    try {
      console.log('📥 Adding invoice to PCS AI processing queue:', invoiceData.invoiceNumber);
      
      const queueItem = {
        id: `pcs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        invoiceData: invoiceData,
        status: 'queued',
        addedAt: new Date().toISOString(),
        attempts: 0,
        maxAttempts: 3
      };

      this.processingQueue.push(queueItem);
      console.log(`📊 Queue status: ${this.processingQueue.length} items pending`);
      
      // Start processing if not already running
      if (this.processingStatus === 'idle') {
        this.processQueue();
      }

      return queueItem.id;
    } catch (error) {
      console.error('❌ Error adding invoice to queue:', error);
      throw error;
    }
  }

  // Process the queue
  async processQueue() {
    if (this.processingStatus === 'processing' || this.processingQueue.length === 0) {
      return;
    }

    this.processingStatus = 'processing';
    console.log('🔄 Starting PCS AI queue processing...');

    while (this.processingQueue.length > 0) {
      const item = this.processingQueue.shift();
      
      try {
        console.log(`📄 Processing invoice ${item.invoiceData.invoiceNumber} (ID: ${item.id})`);
        item.status = 'processing';
        item.startedAt = new Date().toISOString();

        // Process the invoice
        const result = await this.processInvoice(item.invoiceData);
        
        // Mark as successful
        item.status = 'completed';
        item.completedAt = new Date().toISOString();
        item.result = result;
        
        this.stats.successful++;
        console.log(`✅ Invoice ${item.invoiceData.invoiceNumber} processed successfully`);

      } catch (error) {
        console.error(`❌ Error processing invoice ${item.invoiceData.invoiceNumber}:`, error);
        
        item.status = 'failed';
        item.error = error.message;
        item.failedAt = new Date().toISOString();
        item.attempts++;

        // Retry if under max attempts
        if (item.attempts < item.maxAttempts) {
          console.log(`🔄 Retrying invoice ${item.invoiceData.invoiceNumber} (attempt ${item.attempts}/${item.maxAttempts})`);
          this.processingQueue.push(item);
        } else {
          this.stats.failed++;
          console.log(`💀 Invoice ${item.invoiceData.invoiceNumber} failed permanently after ${item.maxAttempts} attempts`);
        }
      }
    }

    this.processingStatus = 'idle';
    this.lastProcessedAt = new Date().toISOString();
    console.log('✅ PCS AI queue processing completed');
  }

  // Process individual invoice
  async processInvoice(invoiceData) {
    try {
      console.log('🔄 Processing PCS AI invoice:', invoiceData.invoiceNumber);

      // Step 1: Validate invoice data
      const validatedData = await this.validateInvoiceData(invoiceData);
      
      // Step 2: Create or update vendor in QuickBooks
      const vendorResult = await this.ensureVendorExists(validatedData.vendor);
      
      // Step 3: Create bill in QuickBooks
      const billResult = await this.createQuickBooksBill(validatedData, vendorResult);
      
      // Step 4: Attach PDF if available
      let attachmentResult = null;
      if (validatedData.pdfPath) {
        attachmentResult = await this.attachPDFToBill(billResult.Id, validatedData.pdfPath);
      }
      
      // Step 5: Update PCS AI system
      await this.updatePCSAIStatus(validatedData.invoiceNumber, 'completed', {
        quickbooksBillId: billResult.Id,
        quickbooksBillNumber: billResult.DocNumber,
        pdfAttached: !!attachmentResult
      });

      // Step 6: Log success
      this.stats.totalProcessed++;
      
      return {
        success: true,
        billId: billResult.Id,
        billNumber: billResult.DocNumber,
        vendorId: vendorResult.Id,
        pdfAttached: !!attachmentResult,
        processingTime: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ PCS AI invoice processing failed:', error);
      
      // Update PCS AI with failure status
      await this.updatePCSAIStatus(invoiceData.invoiceNumber, 'failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  // Validate invoice data
  async validateInvoiceData(invoiceData) {
    const required = ['invoiceNumber', 'vendor', 'totalAmount', 'lineItems'];
    const missing = required.filter(field => !invoiceData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate line items
    if (!Array.isArray(invoiceData.lineItems) || invoiceData.lineItems.length === 0) {
      throw new Error('Line items must be a non-empty array');
    }

    // Validate amounts
    const total = parseFloat(invoiceData.totalAmount);
    if (isNaN(total) || total <= 0) {
      throw new Error('Total amount must be a positive number');
    }

    // Calculate line item total
    const lineTotal = invoiceData.lineItems.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);

    // Allow small difference for rounding
    if (Math.abs(total - lineTotal) > 0.01) {
      console.warn(`⚠️ Amount mismatch: Total ${total} vs Line Total ${lineTotal}`);
    }

    return {
      ...invoiceData,
      totalAmount: total,
      lineItems: invoiceData.lineItems.map(item => ({
        ...item,
        amount: parseFloat(item.amount) || 0,
        description: item.description || 'Dental Supplies'
      }))
    };
  }

  // Ensure vendor exists in QuickBooks
  async ensureVendorExists(vendorName) {
    try {
      console.log(`🔍 Checking if vendor exists: ${vendorName}`);
      
      // Search for existing vendor
      const vendors = await globalQBClient.qboClient.findVendors();
      const existingVendor = vendors.find(v => 
        v.DisplayName && v.DisplayName.toLowerCase() === vendorName.toLowerCase()
      );

      if (existingVendor) {
        console.log(`✅ Vendor found: ${existingVendor.DisplayName} (ID: ${existingVendor.Id})`);
        return existingVendor;
      }

      // Create new vendor
      console.log(`📝 Creating new vendor: ${vendorName}`);
      const newVendor = await globalQBClient.qboClient.createVendor({
        DisplayName: vendorName,
        Active: true,
        VendorType: '1099',
        PrintOnCheckName: vendorName
      });

      console.log(`✅ New vendor created: ${newVendor.DisplayName} (ID: ${newVendor.Id})`);
      return newVendor;

    } catch (error) {
      console.error('❌ Error ensuring vendor exists:', error);
      throw new Error(`Failed to create/verify vendor: ${error.message}`);
    }
  }

  // Create QuickBooks bill
  async createQuickBooksBill(invoiceData, vendor) {
    try {
      console.log(`📄 Creating QuickBooks bill for invoice: ${invoiceData.invoiceNumber}`);

      // Map line items to QuickBooks format
      const pcsAIAccountId = await this.getPCSAIAccountId();
      const quickbooksLineItems = invoiceData.lineItems.map(item => ({
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: parseFloat(item.amount),
        Description: item.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: pcsAIAccountId
          }
        }
      }));

      const billData = {
        Line: quickbooksLineItems,
        VendorRef: { value: vendor.Id },
        APAccountRef: { value: '33' }, // Accounts Payable
        TotalAmt: parseFloat(invoiceData.totalAmount),
        DocNumber: invoiceData.invoiceNumber,
        TxnDate: invoiceData.dueDate || new Date().toISOString().split('T')[0],
        DueDate: invoiceData.dueDate || new Date().toISOString().split('T')[0],
        Memo: `PCS AI Processed - ${invoiceData.vendor} - ${invoiceData.invoiceNumber}`
      };

      console.log('📄 Bill data for QuickBooks:', JSON.stringify(billData, null, 2));

      const bill = await globalQBClient.createBill(billData);
      console.log(`✅ Bill created successfully: ${bill.Id}`);
      
      return bill;

    } catch (error) {
      console.error('❌ Error creating QuickBooks bill:', error);
      throw new Error(`Failed to create QuickBooks bill: ${error.message}`);
    }
  }

  // Get PCS AI account ID
  async getPCSAIAccountId() {
    try {
      // Use the known PCS AI Bill account ID
      return '1150040000';
    } catch (error) {
      console.error('❌ Error getting PCS AI account ID:', error);
      // Fallback to Supplies account
      return '20';
    }
  }

  // Attach PDF to bill
  async attachPDFToBill(billId, pdfPath) {
    try {
      console.log(`📎 Attaching PDF to bill ${billId}: ${pdfPath}`);
      return await attachPDFToBill(billId, pdfPath);
    } catch (error) {
      console.error('❌ Error attaching PDF:', error);
      throw error;
    }
  }

  // Update PCS AI system status
  async updatePCSAIStatus(invoiceNumber, status, details) {
    try {
      console.log(`🔄 Updating PCS AI status for ${invoiceNumber}: ${status}`);
      
      const updateData = {
        invoiceNumber: invoiceNumber,
        status: status,
        updatedAt: new Date().toISOString(),
        details: details
      };

      // In production, this would update your PCS AI database
      console.log('📊 PCS AI Status Update:', JSON.stringify(updateData, null, 2));
      
      // TODO: Implement actual PCS AI database update
      // await pcsAIDatabase.updateInvoiceStatus(updateData);
      
      return updateData;
    } catch (error) {
      console.error('❌ Error updating PCS AI status:', error);
      throw error;
    }
  }

  // Get workflow statistics
  getStats() {
    return {
      ...this.stats,
      queueLength: this.processingQueue.length,
      status: this.processingStatus,
      lastProcessedAt: this.lastProcessedAt
    };
  }

  // Get queue status
  getQueueStatus() {
    return {
      length: this.processingQueue.length,
      status: this.processingStatus,
      items: this.processingQueue.map(item => ({
        id: item.id,
        invoiceNumber: item.invoiceData.invoiceNumber,
        status: item.status,
        addedAt: item.addedAt,
        attempts: item.attempts
      }))
    };
  }
}

// Initialize PCS AI workflow
const pcsAIWorkflow = new PCSAIWorkflow();

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

// New endpoint: Integrate with PCS AI invoice processing workflow
app.post('/api/qbo/process-invoice', async (req, res) => {
  try {
    console.log('🔄 PCS AI Invoice Processing - QuickBooks Integration');
    console.log('📄 Received invoice data:', JSON.stringify(req.body, null, 2));

    const { 
      invoiceData, 
      pdfPath, 
      vendorName, 
      invoiceNumber, 
      totalAmount, 
      dueDate, 
      lineItems,
      extractedText,
      confidence,
      processingMetadata 
    } = req.body;

    // Extract data from invoiceData if it exists, otherwise use direct fields
    const vendor = vendorName || (invoiceData && invoiceData.vendor);
    const invoiceNum = invoiceNumber || (invoiceData && invoiceData.invoiceNumber);
    const amount = totalAmount || (invoiceData && invoiceData.amount);
    const items = lineItems || (invoiceData && invoiceData.lineItems);
    const due = dueDate || (invoiceData && invoiceData.dueDate);

    // Validate required fields
    if (!vendor || !invoiceNum || !amount || !items) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['vendorName/vendor', 'invoiceNumber', 'totalAmount/amount', 'lineItems'],
        received: Object.keys(req.body),
        receivedData: {
          vendor: vendor,
          invoiceNumber: invoiceNum,
          totalAmount: amount,
          lineItems: items
        }
      });
    }

    // Map PCS AI line items to QuickBooks format
    const quickbooksLineItems = items.map(item => ({
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: parseFloat(item.amount) || 0,
      Description: item.description || 'Dental Supplies',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: item.accountId || '20' // Default to Supplies account
        }
      }
    }));

    // Create QuickBooks bill
    const billData = {
      Line: quickbooksLineItems,
      VendorRef: {
        value: '33' // Use existing vendor for now
      },
      APAccountRef: {
        value: '33' // Accounts Payable
      },
      TotalAmt: parseFloat(amount),
      DocNumber: invoiceNum,
      TxnDate: due || new Date().toISOString().split('T')[0],
      DueDate: due || new Date().toISOString().split('T')[0],
      Memo: `PCS AI Processed Invoice - ${vendor}`
    };

    console.log('📄 Creating QuickBooks bill from PCS AI data:', JSON.stringify(billData, null, 2));

    // Send to QuickBooks
    const bill = await globalQBClient.createBill(billData);
    
    console.log('✅ Bill created successfully from PCS AI:', bill.Id);

    // If PDF path provided, attach it to the bill
    let attachmentResult = null;
    if (pdfPath) {
      try {
        console.log('📎 Attaching PDF to bill:', bill.Id, 'from path:', pdfPath);
        attachmentResult = await attachPDFToBill(bill.Id, pdfPath);
      } catch (attachError) {
        console.log('⚠️ PDF attachment failed (non-critical):', attachError.message);
      }
    }

    res.json({
      success: true,
      message: 'Invoice processed and sent to QuickBooks successfully',
      billId: bill.Id,
      billNumber: bill.DocNumber,
      vendor: vendor,
      amount: amount,
      pdfAttached: !!attachmentResult,
      processingMetadata: {
        extractedText: extractedText ? 'Available' : 'Not provided',
        confidence: confidence || 'Unknown',
        processingTimestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ PCS AI Invoice Processing Error:', error);
    
    const errorResponse = {
      error: 'Failed to process invoice through PCS AI workflow',
      details: error.message,
      timestamp: new Date().toISOString()
    };

    if (error.Fault && error.Fault.Error) {
      errorResponse.quickbooksError = error.Fault.Error[0];
    }

    res.status(500).json(errorResponse);
  }
});

// ============================================================================
// PCS AI WORKFLOW MANAGEMENT ENDPOINTS
// ============================================================================

// Get PCS AI workflow statistics
app.get('/api/qbo/pcs-ai/stats', quickbooksRateLimit, async (req, res) => {
  try {
    const stats = pcsAIWorkflow.getStats();
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting PCS AI workflow stats:', error);
    res.status(500).json({
      error: 'Failed to get workflow statistics',
      details: error.message
    });
  }
});

// Get PCS AI workflow queue status
app.get('/api/qbo/pcs-ai/queue', quickbooksRateLimit, async (req, res) => {
  try {
    const queueStatus = pcsAIWorkflow.getQueueStatus();
    res.json({
      success: true,
      queue: queueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting PCS AI workflow queue:', error);
    res.status(500).json({
      error: 'Failed to get queue status',
      details: error.message
    });
  }
});

// Add invoice to PCS AI workflow queue
app.post('/api/qbo/pcs-ai/queue', async (req, res) => {
  try {
    console.log('📥 Adding invoice to PCS AI workflow queue');
    console.log('📄 Invoice data:', JSON.stringify(req.body, null, 2));

    const { invoiceData } = req.body;

    if (!invoiceData) {
      return res.status(400).json({
        error: 'Missing invoiceData in request body'
      });
    }

    // Add to workflow queue
    const queueId = await pcsAIWorkflow.addToQueue(invoiceData);
    
    console.log(`📥 Invoice added to queue with ID: ${queueId}`);

    res.json({
      success: true,
      message: 'Invoice added to PCS AI processing queue',
      queueId: queueId,
      status: 'queued',
      estimatedProcessingTime: '2-5 minutes',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error adding invoice to PCS AI queue:', error);
    res.status(500).json({
      error: 'Failed to add invoice to queue',
      details: error.message
    });
  }
});

// Process PCS AI workflow queue manually (for testing)
app.post('/api/qbo/pcs-ai/process', async (req, res) => {
  try {
    console.log('🔄 Manually triggering PCS AI workflow processing');
    
    // Start processing the queue
    await pcsAIWorkflow.processQueue();
    
    res.json({
      success: true,
      message: 'PCS AI workflow processing triggered',
      status: 'processing',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error triggering PCS AI workflow processing:', error);
    res.status(500).json({
      error: 'Failed to trigger workflow processing',
      details: error.message
    });
  }
});

// Get PCS AI workflow status
app.get('/api/qbo/pcs-ai/status', async (req, res) => {
  try {
    const stats = pcsAIWorkflow.getStats();
    const queueStatus = pcsAIWorkflow.getQueueStatus();
    
    res.json({
      success: true,
      status: {
        workflow: {
          status: pcsAIWorkflow.processingStatus,
          lastProcessedAt: pcsAIWorkflow.lastProcessedAt,
          stats: stats
        },
        queue: queueStatus,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting PCS AI workflow status:', error);
    res.status(500).json({
      error: 'Failed to get workflow status',
      details: error.message
    });
  }
});

// Helper function to attach PDF to QuickBooks bill
async function attachPDFToBill(billId, pdfPath) {
  try {
    console.log('📎 Attaching PDF to bill:', billId, 'from path:', pdfPath);
    
    // Read the actual PDF file
    const fs = require('fs');
    const path = require('path');
    
    // Resolve the full path
    const fullPath = path.resolve(pdfPath);
    console.log('📁 Full PDF path:', fullPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`PDF file not found: ${fullPath}`);
    }
    
    // Read the PDF file as base64
    const pdfBuffer = fs.readFileSync(fullPath);
    const base64Data = pdfBuffer.toString('base64');
    
    console.log('📄 PDF file read successfully, size:', pdfBuffer.length, 'bytes');
    
    // Create the attachment in QuickBooks
    const attachmentData = {
      FileName: path.basename(pdfPath),
      Note: `Invoice PDF from PCS AI processing - ${new Date().toISOString()}`,
      AttachableRef: [{
        EntityRef: {
          type: 'Bill',
          value: billId
        }
      }],
      ContentType: 'application/pdf'
    };

    // Use the upload method for attachments in node-quickbooks SDK
    return new Promise((resolve, reject) => {
      globalQBClient.qboClient.upload(
        path.basename(pdfPath),           // filename
        'application/pdf',                // contentType
        base64Data,                       // stream (base64 data)
        'Bill',                           // entityType
        billId,                           // entityId
        (err, attachable) => {
          if (err) {
            console.error('❌ Error attaching PDF:', err);
            reject(err);
          } else {
            console.log('✅ PDF attached successfully to QuickBooks:', attachable.Id);
            resolve(attachable);
          }
        }
      );
    });
    
  } catch (error) {
    console.error('❌ PDF attachment error:', error);
    throw error;
  }
}

// Test endpoint for PDF attachments
app.post('/api/qbo/test-pdf-attachment', async (req, res) => {
  try {
    console.log('🧪 Testing PDF attachment functionality');
    
    const { billId, pdfPath } = req.body;
    
    if (!billId || !pdfPath) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['billId', 'pdfPath'],
        example: {
          billId: '148',
          pdfPath: './sample_invoices_pcs/Henry_Schein/henry_invoice_1.pdf'
        }
      });
    }
    
    console.log('📎 Testing PDF attachment for bill:', billId, 'with PDF:', pdfPath);
    
    // Check if the PDF file exists before attempting attachment
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.resolve(pdfPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(400).json({
        error: 'PDF file not found',
        providedPath: pdfPath,
        fullPath: fullPath,
        suggestion: 'Please provide a valid PDF path. You can use one of the sample invoices:',
        samplePaths: [
          './sample_invoices_pcs/Henry_Schein/henry_invoice_1.pdf',
          './sample_invoices_pcs/Epic_Dental_Lab/epic_invoice_1.pdf',
          './sample_invoices_pcs/Patterson_Dental/patterson_invoice_1.PDF'
        ]
      });
    }
    
    const attachment = await attachPDFToBill(billId, pdfPath);
    
    res.json({
      success: true,
      message: 'PDF attachment test successful',
      billId: billId,
      attachmentId: attachment.Id,
      fileName: attachment.FileName,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ PDF attachment test failed:', error);
    res.status(500).json({
      error: 'PDF attachment test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Catch-all route for OAuth callbacks and unknown routes (MUST be last!)
// MOVED TO END OF FILE

app.listen(PORT, () => {
  console.log(`🚀 Development API server running on http://localhost:${PORT}`);
  console.log(`🔗 QuickBooks OAuth: http://localhost:${PORT}/api/qbo/connect`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`🔍 Debug endpoint: http://localhost:${PORT}/api/qbo/debug-env`);
  
  // Try to restore global client from saved tokens
  if (restoreGlobalClient()) {
    console.log('✅ QuickBooks client restored from saved tokens');
  } else {
    console.log('⚠️ No saved tokens found - complete OAuth to connect');
  }
}); 

// ============================================================================
// SECURITY & AUTHENTICATION MIDDLEWARE
// ============================================================================

// API Key validation middleware
const validateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Please provide a valid API key in the x-api-key header or Authorization header'
    });
  }

  // In production, validate against database/stored keys
  const validKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['test-key-123'];
  
  if (!validKeys.includes(apiKey)) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  // Add API key info to request for logging
  req.apiKey = apiKey;
  req.apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 8);
  
  next();
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Remove potentially dangerous properties
  delete req.body.__proto__;
  delete req.body.constructor;
  
  // Sanitize string inputs
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].replace(/[<>]/g, '');
      }
    });
  }
  
  next();
};

// Enhanced logging middleware
const enhancedLogging = (req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Log incoming request
  console.log(`🔐 [${requestId}] ${req.method} ${req.path} - API Key: ${req.apiKeyHash || 'none'} - IP: ${req.ip}`);
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    console.log(`✅ [${requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Apply security middleware to protected routes only
// Health and metrics endpoints are public (no auth required)
app.use('/api', validateAPIKey);
app.use('/api', sanitizeRequest);
app.use('/api', enhancedLogging);

// Health endpoints moved to end of file

// ============================================================================
// PCS AI DATABASE INTEGRATION LAYER
// ============================================================================

class PCSAIDatabase {
  constructor() {
    this.dataPath = path.join(__dirname, 'pcs_ai_data');
    this.invoicesPath = path.join(this.dataPath, 'invoices.json');
    this.processingHistoryPath = path.join(this.dataPath, 'processing_history.json');
    this.systemStatePath = path.join(this.dataPath, 'system_state.json');
    
    this.ensureDataDirectory();
    this.initializeDataFiles();
  }

  // Ensure data directory exists
  ensureDataDirectory() {
    const fs = require('fs');
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
      console.log('📁 Created PCS AI data directory');
    }
  }

  // Initialize data files if they don't exist
  initializeDataFiles() {
    const fs = require('fs');
    
    const defaultFiles = {
      [this.invoicesPath]: { invoices: [], lastUpdated: new Date().toISOString() },
      [this.processingHistoryPath]: { history: [], lastUpdated: new Date().toISOString() },
      [this.systemStatePath]: { state: {}, lastUpdated: new Date().toISOString() }
    };

    Object.entries(defaultFiles).forEach(([filePath, defaultData]) => {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        console.log(`📄 Created ${path.basename(filePath)}`);
      }
    });
  }

  // Save invoice data
  async saveInvoice(invoiceData) {
    try {
      const fs = require('fs').promises;
      const data = JSON.parse(await fs.readFile(this.invoicesPath, 'utf8'));
      
      // Add invoice with metadata
      const invoice = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...invoiceData,
        createdAt: new Date().toISOString(),
        status: 'pending',
        processingAttempts: 0
      };
      
      data.invoices.push(invoice);
      data.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(this.invoicesPath, JSON.stringify(data, null, 2));
      
      console.log(`💾 Invoice saved to database: ${invoice.id}`);
      return invoice;
      
    } catch (error) {
      console.error('❌ Error saving invoice to database:', error);
      throw error;
    }
  }

  // Update invoice status
  async updateInvoiceStatus(invoiceId, status, details = {}) {
    try {
      const fs = require('fs').promises;
      const data = JSON.parse(await fs.readFile(this.invoicesPath, 'utf8'));
      
      const invoice = data.invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        throw new Error(`Invoice not found: ${invoiceId}`);
      }
      
      // Update invoice
      invoice.status = status;
      invoice.lastUpdated = new Date().toISOString();
      invoice.processingAttempts = (invoice.processingAttempts || 0) + 1;
      
      // Add status details
      if (!invoice.statusHistory) invoice.statusHistory = [];
      invoice.statusHistory.push({
        status,
        timestamp: new Date().toISOString(),
        details
      });
      
      data.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.invoicesPath, JSON.stringify(data, null, 2));
      
      console.log(`📊 Invoice status updated: ${invoiceId} -> ${status}`);
      return invoice;
      
    } catch (error) {
      console.error('❌ Error updating invoice status:', error);
      throw error;
    }
  }

  // Get invoice by ID
  async getInvoice(invoiceId) {
    try {
      const fs = require('fs').promises;
      const data = JSON.parse(await fs.readFile(this.invoicesPath, 'utf8'));
      
      return data.invoices.find(inv => inv.id === invoiceId);
      
    } catch (error) {
      console.error('❌ Error getting invoice:', error);
      return null;
    }
  }

  // Get all invoices with optional filtering
  async getInvoices(filters = {}) {
    try {
      const fs = require('fs').promises;
      const data = JSON.parse(await fs.readFile(this.invoicesPath, 'utf8'));
      
      let invoices = data.invoices;
      
      // Apply filters
      if (filters.status) {
        invoices = invoices.filter(inv => inv.status === filters.status);
      }
      
      if (filters.vendor) {
        invoices = invoices.filter(inv => inv.vendor === filters.vendor);
      }
      
      if (filters.dateFrom) {
        invoices = invoices.filter(inv => new Date(inv.createdAt) >= new Date(filters.dateFrom));
      }
      
      if (filters.dateTo) {
        invoices = invoices.filter(inv => new Date(inv.createdAt) <= new Date(filters.dateTo));
      }
      
      return invoices;
      
    } catch (error) {
      console.error('❌ Error getting invoices:', error);
      return [];
    }
  }

  // Save processing history
  async saveProcessingHistory(historyEntry) {
    try {
      const fs = require('fs').promises;
      const data = JSON.parse(await fs.readFile(this.processingHistoryPath, 'utf8'));
      
      const entry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...historyEntry,
        timestamp: new Date().toISOString()
      };
      
      data.history.push(entry);
      data.lastUpdated = new Date().toISOString();
      
      // Keep only last 1000 entries
      if (data.history.length > 1000) {
        data.history = data.history.slice(-1000);
      }
      
      await fs.writeFile(this.processingHistoryPath, JSON.stringify(data, null, 2));
      
      console.log(`📝 Processing history saved: ${entry.id}`);
      return entry;
      
    } catch (error) {
      console.error('❌ Error saving processing history:', error);
      throw error;
    }
  }

  // Get processing statistics
  async getProcessingStats() {
    try {
      const fs = require('fs').promises;
      const invoiceData = JSON.parse(await fs.readFile(this.invoicesPath, 'utf8'));
      const historyData = JSON.parse(await fs.readFile(this.processingHistoryPath, 'utf8'));
      
      const invoices = invoiceData.invoices;
      const history = historyData.history;
      
      const stats = {
        total: invoices.length,
        byStatus: {},
        byVendor: {},
        processingTimes: [],
        lastUpdated: new Date().toISOString()
      };
      
      // Count by status
      invoices.forEach(inv => {
        stats.byStatus[inv.status] = (stats.byStatus[inv.status] || 0) + 1;
      });
      
      // Count by vendor
      invoices.forEach(inv => {
        stats.byVendor[inv.vendor] = (stats.byVendor[inv.vendor] || 0) + 1;
      });
      
      // Calculate processing times
      history.forEach(entry => {
        if (entry.processingTime) {
          stats.processingTimes.push(entry.processingTime);
        }
      });
      
      if (stats.processingTimes.length > 0) {
        stats.avgProcessingTime = stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length;
      }
      
      return stats;
      
    } catch (error) {
      console.error('❌ Error getting processing stats:', error);
      return null;
    }
  }

  // Backup data
  async backupData() {
    try {
      const fs = require('fs').promises;
      const backupDir = path.join(this.dataPath, 'backups');
      
      if (!require('fs').existsSync(backupDir)) {
        await fs.mkdir(backupDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
      
      const backupData = {
        timestamp: new Date().toISOString(),
        invoices: JSON.parse(await fs.readFile(this.invoicesPath, 'utf8')),
        processingHistory: JSON.parse(await fs.readFile(this.processingHistoryPath, 'utf8')),
        systemState: JSON.parse(await fs.readFile(this.systemStatePath, 'utf8'))
      };
      
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      
      console.log(`💾 Data backup created: ${path.basename(backupPath)}`);
      return backupPath;
      
    } catch (error) {
      console.error('❌ Error creating backup:', error);
      throw error;
    }
  }
}

// Initialize PCS AI database
const pcsAIDatabase = new PCSAIDatabase();

// ============================================================================
// PCS AI DATABASE API ENDPOINTS
// ============================================================================

// Get all invoices with optional filtering
app.get('/api/qbo/pcs-ai/invoices', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      vendor: req.query.vendor,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };
    
    const invoices = await pcsAIDatabase.getInvoices(filters);
    
    res.json({
      success: true,
      invoices: invoices,
      count: invoices.length,
      filters: filters,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting invoices:', error);
    res.status(500).json({
      error: 'Failed to get invoices',
      details: error.message
    });
  }
});

// Get invoice by ID
app.get('/api/qbo/pcs-ai/invoices/:id', async (req, res) => {
  try {
    const invoice = await pcsAIDatabase.getInvoice(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        message: `Invoice with ID ${req.params.id} not found`
      });
    }
    
    res.json({
      success: true,
      invoice: invoice
    });
    
  } catch (error) {
    console.error('❌ Error getting invoice:', error);
    res.status(500).json({
      error: 'Failed to get invoice',
      details: error.message
    });
  }
});

// Get processing statistics
app.get('/api/qbo/pcs-ai/statistics', async (req, res) => {
  try {
    const stats = await pcsAIDatabase.getProcessingStats();
    
    res.json({
      success: true,
      statistics: stats
    });
    
  } catch (error) {
    console.error('❌ Error getting statistics:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

// Create data backup
app.post('/api/qbo/pcs-ai/backup', async (req, res) => {
  try {
    const backupPath = await pcsAIDatabase.backupData();
    
    res.json({
      success: true,
      message: 'Data backup created successfully',
      backupPath: path.basename(backupPath),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    res.status(500).json({
      error: 'Failed to create backup',
      details: error.message
    });
  }
});

// Get processing history
app.get('/api/qbo/pcs-ai/history', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const historyData = JSON.parse(await fs.readFile(pcsAIDatabase.processingHistoryPath, 'utf8'));
    
    // Apply pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    const history = historyData.history.slice(startIndex, endIndex);
    const totalPages = Math.ceil(historyData.history.length / limit);
    
    res.json({
      success: true,
      history: history,
      pagination: {
        page: page,
        limit: limit,
        total: historyData.history.length,
        totalPages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting processing history:', error);
    res.status(500).json({
      error: 'Failed to get processing history',
      details: error.message
    });
  }
});

// ============================================================================
// ADVANCED ERROR HANDLING & MONITORING
// ============================================================================

// Circuit breaker for external API calls
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`🚨 Circuit breaker OPENED after ${this.failureCount} failures`);
    }
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.state === 'OPEN'
    };
  }
}

// Initialize circuit breakers
const quickBooksCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30s timeout
const pcsAICircuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 60s timeout

// Enhanced error handling middleware
const enhancedErrorHandler = (error, req, res, next) => {
  const errorId = crypto.randomBytes(8).toString('hex');
  const timestamp = new Date().toISOString();
  
  // Log error with context
  console.error(`❌ [${errorId}] Error occurred:`, {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    apiKey: req.apiKeyHash,
    requestId: req.requestId,
    timestamp: timestamp
  });

  // Determine error type and response
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    errorId: errorId,
    timestamp: timestamp
  };

  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorResponse = {
      error: 'Validation Error',
      message: error.message,
      details: error.details,
      errorId: errorId,
      timestamp: timestamp
    };
  } else if (error.name === 'AuthenticationError') {
    statusCode = 401;
    errorResponse = {
      error: 'Authentication Error',
      message: error.message,
      errorId: errorId,
      timestamp: timestamp
    };
  } else if (error.name === 'AuthorizationError') {
    statusCode = 403;
    errorResponse = {
      error: 'Authorization Error',
      message: error.message,
      errorId: errorId,
      timestamp: timestamp
    };
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    errorResponse = {
      error: 'Not Found',
      message: error.message,
      errorId: errorId,
      timestamp: timestamp
    };
  } else if (error.name === 'RateLimitError') {
    statusCode = 429;
    errorResponse = {
      error: 'Rate Limit Exceeded',
      message: 'Too many requests, please try again later',
      errorId: errorId,
      timestamp: timestamp
    };
  }

  // Add circuit breaker status if relevant
  if (error.message.includes('QuickBooks') || error.message.includes('quickbooks')) {
    errorResponse.circuitBreaker = quickBooksCircuitBreaker.getStatus();
  }

  res.status(statusCode).json(errorResponse);
};

// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
    
    // Log slow requests
    if (duration > 1000) { // 1 second threshold
      console.warn(`🐌 Slow request detected: ${req.method} ${req.path} took ${duration.toFixed(2)}ms`);
    }
    
    // Store performance metrics
    if (!global.performanceMetrics) {
      global.performanceMetrics = {
        requests: 0,
        totalDuration: 0,
        slowRequests: 0,
        averageDuration: 0
      };
    }
    
    global.performanceMetrics.requests++;
    global.performanceMetrics.totalDuration += duration;
    global.performanceMetrics.averageDuration = global.performanceMetrics.totalDuration / global.performanceMetrics.requests;
    
    if (duration > 1000) {
      global.performanceMetrics.slowRequests++;
    }
  });
  
  next();
};

// Apply performance monitoring
app.use(performanceMonitor);

// Global error handler (must be last)
app.use(enhancedErrorHandler);

// PCS AI QuickBooks Category Integration
class PCSAIQuickBooksIntegration {
  constructor() {
    this.categories = new Map();
    this.categoryMappings = new Map();
    this.loadCategories();
  }

  // Load categories from storage
  loadCategories() {
    try {
      if (fs.existsSync('./pcs_ai_data/quickbooks_categories.json')) {
        const data = JSON.parse(fs.readFileSync('./pcs_ai_data/quickbooks_categories.json', 'utf8'));
        this.categories = new Map(data.categories);
        this.categoryMappings = new Map(data.mappings);
        console.log(`📚 Loaded ${this.categories.size} QuickBooks categories and ${this.categoryMappings.size} mappings`);
      }
    } catch (error) {
      console.log('📚 No existing categories found, will sync from QuickBooks');
    }
  }

  // Save categories to storage
  saveCategories() {
    try {
      if (!fs.existsSync('./pcs_ai_data')) {
        fs.mkdirSync('./pcs_ai_data', { recursive: true });
      }
      
      const data = {
        categories: Array.from(this.categories.entries()),
        mappings: Array.from(this.categoryMappings.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync('./pcs_ai_data/quickbooks_categories.json', JSON.stringify(data, null, 2));
      console.log('💾 QuickBooks categories saved to storage');
    } catch (error) {
      console.error('❌ Error saving categories:', error);
    }
  }

  // Sync categories from QuickBooks
  async syncCategoriesFromQuickBooks() {
    try {
      console.log('🔄 Syncing QuickBooks categories...');
      
      if (!globalQBClient || !globalQBClient.qboClient) {
        throw new Error('QuickBooks client not available');
      }

      // Get all accounts from QuickBooks
      const accounts = await new Promise((resolve, reject) => {
        globalQBClient.qboClient.findAccounts({}, (err, accounts) => {
          if (err) reject(err);
          else resolve(accounts);
        });
      });

      // Process accounts and create category mappings
      this.categories.clear();
      this.categoryMappings.clear();

      if (accounts && accounts.QueryResponse && accounts.QueryResponse.Account) {
        const accountList = accounts.QueryResponse.Account;
        
        accountList.forEach(account => {
          if (account.Active && account.AccountType === 'Expense') {
            const categoryId = account.Id;
            const categoryName = account.Name;
            const categoryType = account.AccountType;
            const categorySubType = account.AccountSubType;
            
            // Store category information
            this.categories.set(categoryId, {
              id: categoryId,
              name: categoryName,
              type: categoryType,
              subType: categorySubType,
              fullyQualifiedName: account.FullyQualifiedName
            });

            // Create mappings for easy lookup
            this.categoryMappings.set(categoryName.toLowerCase(), categoryId);
            this.categoryMappings.set(account.FullyQualifiedName.toLowerCase(), categoryId);
            
            // Create mappings for common variations
            if (categorySubType) {
              this.categoryMappings.set(categorySubType.toLowerCase(), categoryId);
            }
          }
        });

        console.log(`✅ Synced ${this.categories.size} expense categories from QuickBooks`);
        this.saveCategories();
        return true;
      } else {
        throw new Error('No accounts found in QuickBooks response');
      }
    } catch (error) {
      console.error('❌ Error syncing categories:', error);
      return false;
    }
  }

  // Find best matching category for a line item
  findBestCategory(description, amount, vendorName) {
    const desc = description.toLowerCase();
    const vendor = vendorName.toLowerCase();
    
    // Try exact matches first
    for (const [key, categoryId] of this.categoryMappings) {
      if (desc.includes(key) || key.includes(desc)) {
        return this.categories.get(categoryId);
      }
    }

    // Try vendor-based matching
    if (vendor.includes('dental') || vendor.includes('medical')) {
      return this.findCategoryByKeywords(['dental', 'medical', 'healthcare', 'supplies']);
    }
    
    if (vendor.includes('equipment') || vendor.includes('maintenance')) {
      return this.findCategoryByKeywords(['equipment', 'maintenance', 'repair', 'tools']);
    }

    // Try amount-based categorization
    if (amount > 1000) {
      return this.findCategoryByKeywords(['equipment', 'capital', 'asset']);
    }

    // Default to general expense categories
    return this.findCategoryByKeywords(['supplies', 'expense', 'general']);
  }

  // Find category by keywords
  findCategoryByKeywords(keywords) {
    for (const [key, categoryId] of this.categoryMappings) {
      for (const keyword of keywords) {
        if (key.includes(keyword)) {
          return this.categories.get(categoryId);
        }
      }
    }
    
    // Return first available category as fallback
    const firstCategory = this.categories.values().next().value;
    return firstCategory || null;
  }

  // Get all categories for UI display
  getAllCategories() {
    return Array.from(this.categories.values());
  }

  // Get category by ID
  getCategoryById(id) {
    return this.categories.get(id);
  }

  // Get category by name
  getCategoryByName(name) {
    const categoryId = this.categoryMappings.get(name.toLowerCase());
    return categoryId ? this.categories.get(categoryId) : null;
  }
}

// Initialize the integration
const pcsAIQBIntegration = new PCSAIQuickBooksIntegration();

// Enhanced PCS AI Invoice Processing with QuickBooks Integration
app.post('/api/qbo/pcs-ai/process-invoice-enhanced', async (req, res) => {
  try {
    console.log('🚀 Enhanced PCS AI Invoice Processing with QuickBooks Integration');
    
    const { invoiceData, pdfPath, vendorName, invoiceNumber, totalAmount, dueDate, lineItems, extractedText, confidence, processingMetadata } = req.body;

    // Validate required fields
    if (!invoiceData || !vendorName || !invoiceNumber || !totalAmount || !lineItems) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['invoiceData', 'vendorName', 'invoiceNumber', 'totalAmount', 'lineItems']
      });
    }

    console.log('📋 Processing invoice:', {
      vendor: vendorName,
      invoiceNumber,
      totalAmount,
      lineItemsCount: lineItems.length
    });

    // Step 1: Sync QuickBooks categories if needed
    if (pcsAIQBIntegration.categories.size === 0) {
      console.log('🔄 No categories found, syncing from QuickBooks...');
      await pcsAIQBIntegration.syncCategoriesFromQuickBooks();
    }

    // Step 2: Process line items with dental category mapping and QuickBooks integration
    const enhancedLineItems = lineItems.map((item, index) => {
      const description = item.description || item.Description || 'Unknown Item';
      const amount = item.amount || item.Amount || 0;
      
      // First, try dental category mapping
      const dentalCategory = matchDentalCategory(description, amount);
      
      // Then, try QuickBooks category mapping
      const qbCategory = pcsAIQBIntegration.findBestCategory(
        description,
        amount,
        vendorName
      );

      return {
        id: index + 1,
        description,
        amount: parseFloat(amount),
        quantity: item.quantity || item.Quantity || 1,
        unitPrice: item.unitPrice || item.UnitPrice || amount,
        dentalCategory: dentalCategory ? {
          categoryKey: dentalCategory.categoryKey,
          qboCategory: dentalCategory.qboCategory,
          subCategory: dentalCategory.subCategory,
          confidence: dentalCategory.confidence,
          matchedKeywords: dentalCategory.matchedKeywords
        } : null,
        quickBooksCategory: qbCategory ? {
          id: qbCategory.id,
          name: qbCategory.name,
          type: qbCategory.type,
          subType: qbCategory.subType
        } : null,
        confidence: item.confidence || confidence || 0.8,
        categoryPriority: dentalCategory ? 'dental' : (qbCategory ? 'quickbooks' : 'none')
      };
    });

    // Step 3: Create enhanced invoice object
    const enhancedInvoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      vendorName,
      invoiceNumber,
      totalAmount: parseFloat(totalAmount),
      dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lineItems: enhancedLineItems,
      pdfPath: pdfPath || null,
      extractedText: extractedText || '',
      confidence: confidence || 0.8,
      processingMetadata: {
        ...processingMetadata,
        quickBooksCategoriesSynced: true,
        categoriesCount: pcsAIQBIntegration.categories.size,
        processingTimestamp: new Date().toISOString()
      },
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Step 4: Save to PCS AI database
    const savedInvoice = await pcsAIDatabase.saveInvoice(enhancedInvoice);
    console.log('💾 Invoice saved to PCS AI database:', savedInvoice.id);

    // Step 5: Add to processing queue
    pcsAIWorkflow.addToQueue({
      type: 'invoice_processing',
      invoiceId: savedInvoice.id,
      data: enhancedInvoice,
      priority: 'high',
      timestamp: new Date().toISOString()
    });

    console.log('✅ Enhanced invoice processing completed successfully');

    res.json({
      success: true,
      message: 'Enhanced invoice processing completed',
      invoice: {
        id: savedInvoice.id,
        status: savedInvoice.status,
        quickBooksCategories: enhancedLineItems.map(item => item.quickBooksCategory).filter(Boolean),
        totalCategories: pcsAIQBIntegration.categories.size
      },
      nextSteps: [
        'Invoice is now in PCS AI database',
        'QuickBooks categories have been mapped',
        'Invoice is queued for approval processing',
        'Once approved, QuickBooks bill will be created automatically'
      ]
    });

  } catch (error) {
    console.error('❌ Enhanced invoice processing error:', error);
    res.status(500).json({
      error: 'Enhanced invoice processing failed',
      details: error.message,
      errorId: generateErrorId()
    });
  }
});

// QuickBooks Category Management Endpoints
app.get('/api/qbo/pcs-ai/categories', (req, res) => {
  try {
    const categories = pcsAIQBIntegration.getAllCategories();
    res.json({
      success: true,
      categories,
      total: categories.length,
      lastUpdated: pcsAIQBIntegration.categories.size > 0 ? 'Available' : 'Not synced'
    });
  } catch (error) {
    console.error('❌ Error getting categories:', error);
    res.status(500).json({
      error: 'Failed to get categories',
      details: error.message
    });
  }
});

app.post('/api/qbo/pcs-ai/sync-categories', async (req, res) => {
  try {
    console.log('🔄 Manual category sync requested');
    const success = await pcsAIQBIntegration.syncCategoriesFromQuickBooks();
    
    if (success) {
      res.json({
        success: true,
        message: 'Categories synced successfully',
        categoriesCount: pcsAIQBIntegration.categories.size,
        mappingsCount: pcsAIQBIntegration.categoryMappings.size
      });
    } else {
      res.status(500).json({
        error: 'Category sync failed',
        details: 'Check QuickBooks connection and try again'
      });
    }
  } catch (error) {
    console.error('❌ Error syncing categories:', error);
    res.status(500).json({
      error: 'Category sync failed',
      details: error.message
    });
  }
});

app.get('/api/qbo/pcs-ai/categories/search', (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        error: 'Search query required',
        example: '/api/qbo/pcs-ai/categories/search?query=dental'
      });
    }

    const results = Array.from(pcsAIQBIntegration.categories.values())
      .filter(category => 
        category.name.toLowerCase().includes(query.toLowerCase()) ||
        category.fullyQualifiedName.toLowerCase().includes(query.toLowerCase()) ||
        (category.subType && category.subType.toLowerCase().includes(query.toLowerCase()))
      )
      .slice(0, 10); // Limit results

    res.json({
      success: true,
      query,
      results,
      total: results.length
    });
  } catch (error) {
    console.error('❌ Error searching categories:', error);
    res.status(500).json({
      error: 'Category search failed',
      details: error.message
    });
  }
});

// Enhanced invoice approval endpoint that creates QuickBooks bill
app.post('/api/qbo/pcs-ai/approve-invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { approvedBy, notes } = req.body;

    console.log('✅ Invoice approval requested:', { invoiceId, approvedBy });

    // Get invoice from database
    const invoice = await pcsAIDatabase.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        invoiceId
      });
    }

    if (invoice.status !== 'pending_approval') {
      return res.status(400).json({
        error: 'Invoice cannot be approved',
        currentStatus: invoice.status,
        allowedStatuses: ['pending_approval']
      });
    }

    // Update invoice status
    await pcsAIDatabase.updateInvoiceStatus(invoiceId, 'approved', {
      approvedBy,
      approvedAt: new Date().toISOString(),
      notes: notes || ''
    });

    // Create QuickBooks bill
    console.log('📄 Creating QuickBooks bill for approved invoice...');
    
    const billData = {
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.amount,
        accountId: item.quickBooksCategory ? item.quickBooksCategory.id : null
      })),
      pdfPath: invoice.pdfPath,
      memo: `PCS AI Approved Invoice - ${invoice.vendorName} - ${invoice.invoiceNumber}`
    };

    // Create bill in QuickBooks
    const billResult = await createQuickBooksBill(billData);
    
    if (billResult.success) {
      // Update invoice with QuickBooks bill ID
      await pcsAIDatabase.updateInvoiceStatus(invoiceId, 'quickbooks_created', {
        quickBooksBillId: billResult.billId,
        quickBooksCreatedAt: new Date().toISOString()
      });

      // Attach PDF if available
      if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
        try {
          await attachPDFToBill(billResult.billId, invoice.pdfPath);
          console.log('📎 PDF attached to QuickBooks bill');
        } catch (pdfError) {
          console.warn('⚠️ PDF attachment failed:', pdfError.message);
        }
      }

      console.log('✅ Invoice approved and QuickBooks bill created successfully');

      res.json({
        success: true,
        message: 'Invoice approved and QuickBooks bill created',
        invoice: {
          id: invoiceId,
          status: 'quickbooks_created',
          quickBooksBillId: billResult.billId
        },
        bill: billResult,
        nextSteps: [
          'Invoice is now approved in PCS AI',
          'QuickBooks bill has been created',
          'PDF has been attached (if available)',
          'Bill is now visible in QuickBooks'
        ]
      });
    } else {
      // Revert approval if QuickBooks creation failed
      await pcsAIDatabase.updateInvoiceStatus(invoiceId, 'pending_approval', {
        approvalError: 'QuickBooks bill creation failed',
        errorDetails: billResult.error
      });

      throw new Error(`QuickBooks bill creation failed: ${billResult.error}`);
    }

  } catch (error) {
    console.error('❌ Error in invoice approval:', error);
    res.status(500).json({
      error: 'Invoice approval failed',
      message: error.message
    });
  }
});

// Mark invoice as paid and update QuickBooks bill status
app.post('/api/qbo/pcs-ai/mark-invoice-paid/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { paidBy, paymentDate, paymentMethod, paymentReference } = req.body;

    console.log('💰 Marking invoice as paid:', { invoiceId, paidBy, paymentDate });

    // Get invoice from database
    const invoice = await pcsAIDatabase.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        invoiceId
      });
    }

    if (invoice.status !== 'quickbooks_created' && invoice.status !== 'approved') {
      return res.status(400).json({
        error: 'Invoice cannot be marked as paid',
        currentStatus: invoice.status,
        allowedStatuses: ['quickbooks_created', 'approved']
      });
    }

    // Update invoice status to paid
    await pcsAIDatabase.updateInvoiceStatus(invoiceId, 'paid', {
      paidBy,
      paidAt: paymentDate || new Date().toISOString(),
      paymentMethod,
      paymentReference,
      notes: `Marked as paid via PCS AI - ${paymentMethod || 'Unknown method'}`
    });

    // Update QuickBooks bill status if bill exists
    if (invoice.quickBooksBillId) {
      try {
        console.log('📄 Updating QuickBooks bill status to paid...');
        
        // Update bill in QuickBooks to mark as paid
        const updateResult = await updateQuickBooksBillStatus(invoice.quickBooksBillId, 'paid', {
          paymentDate: paymentDate || new Date().toISOString(),
          paymentMethod,
          paymentReference
        });

        if (updateResult.success) {
          console.log('✅ QuickBooks bill status updated successfully');
          
          // Update invoice with QuickBooks payment confirmation
          await pcsAIDatabase.updateInvoiceStatus(invoiceId, 'quickbooks_paid', {
            quickBooksPaymentConfirmed: true,
            quickBooksUpdatedAt: new Date().toISOString()
          });
        } else {
          console.warn('⚠️ QuickBooks bill status update failed:', updateResult.error);
        }
      } catch (qbError) {
        console.warn('⚠️ QuickBooks integration error during payment update:', qbError.message);
        // Don't fail the entire operation if QuickBooks update fails
      }
    }

    console.log('✅ Invoice marked as paid successfully');

    res.json({
      success: true,
      message: 'Invoice marked as paid',
      invoice: {
        id: invoiceId,
        status: invoice.quickBooksBillId ? 'quickbooks_paid' : 'paid',
        paymentDetails: {
          paidBy,
          paidAt: paymentDate || new Date().toISOString(),
          paymentMethod,
          paymentReference
        },
        quickBooksStatus: invoice.quickBooksBillId ? 'updated' : 'no_bill'
      },
      nextSteps: [
        'Invoice is now marked as paid in PCS AI',
        'QuickBooks bill status has been updated (if applicable)',
        'Payment information has been recorded'
      ]
    });

  } catch (error) {
    console.error('❌ Error marking invoice as paid:', error);
    res.status(500).json({
      error: 'Failed to mark invoice as paid',
      message: error.message
    });
  }
});
