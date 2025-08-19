import { OAuthClient } from 'intuit-oauth';

/**
 * QuickBooks OAuth Client - Based on proven implementation from qb-oauth-python
 * Handles OAuth 2.0 flow, token management, and API authentication
 */
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

  /**
   * Generate authorization URL for OAuth flow
   * @param {string} stateToken - CSRF protection token
   * @returns {string} Authorization URL
   */
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

  /**
   * Exchange authorization code for access token
   * @param {string} authCode - Authorization code from callback
   * @param {string} realmId - QuickBooks company/realm ID
   * @returns {Object} Token response with access_token, refresh_token, etc.
   */
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

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token to use
   * @returns {Object} New token response
   */
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

  /**
   * Revoke access token or refresh token
   * @param {string} token - Token to revoke (access or refresh)
   * @returns {boolean} Success status
   */
  async revokeToken(token = null) {
    try {
      const tokenToRevoke = token || (this.tokens ? this.tokens.accessToken : null);
      
      if (!tokenToRevoke) {
        throw new Error('Token to revoke is required');
      }

      console.log('🚫 Revoking token...');

      // Use Intuit's OAuth client to revoke token
      await this.oauthClient.revoke(tokenToRevoke);
      
      // Clear stored tokens
      this.tokens = null;
      
      console.log('✅ Token revoked successfully');
      return true;

    } catch (error) {
      console.error('❌ Error revoking token:', error);
      return false;
    }
  }

  /**
   * Get current access token
   * @returns {string|null} Current access token or null
   */
  getAccessToken() {
    return this.tokens ? this.tokens.accessToken : null;
  }

  /**
   * Check if we have valid tokens
   * @returns {boolean} True if tokens exist
   */
  hasValidTokens() {
    return !!(this.tokens && this.tokens.accessToken);
  }

  /**
   * Generate CSRF protection state token
   * @returns {string} Random state token
   */
  generateStateToken() {
    return 'qbo_oauth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get QuickBooks API base URL based on environment
   * @returns {string} API base URL
   */
  getApiBaseUrl() {
    return this.environment === 'sandbox' 
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';
  }

  /**
   * Make authenticated API request to QuickBooks
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   */
  async makeApiRequest(endpoint, options = {}) {
    try {
      if (!this.hasValidTokens()) {
        throw new Error('No valid access token available');
      }

      const baseUrl = this.getApiBaseUrl();
      const url = `${baseUrl}${endpoint}`;
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.getAccessToken()}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`QuickBooks API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('❌ QuickBooks API request failed:', error);
      throw error;
    }
  }
}

export default QBOAuthClient;
