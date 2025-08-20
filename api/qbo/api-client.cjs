/**
 * QuickBooks API Client
 * Handles all QuickBooks API interactions for PCS AI integration
 */

const QuickBooksAPI = {
  // Environment configuration
  environment: process.env.QBO_ENV || 'sandbox',
  baseUrl: process.env.QBO_ENV === 'production' 
    ? 'https://quickbooks.api.intuit.com' 
    : 'https://sandbox-quickbooks.api.intuit.com',

  /**
   * Get access tokens from storage (placeholder - implement your storage solution)
   */
  async getAccessTokens() {
    // TODO: Implement secure token storage (database, encrypted file, etc.)
    // For now, return from environment variables for testing
    return {
      accessToken: process.env.QBO_ACCESS_TOKEN,
      refreshToken: process.env.QBO_REFRESH_TOKEN,
      realmId: process.env.QBO_REALM_ID
    };
  },

  /**
   * Make authenticated request to QuickBooks API
   */
  async makeRequest(endpoint, method = 'GET', data = null) {
    try {
      const tokens = await this.getAccessTokens();
      
      if (!tokens.accessToken) {
        throw new Error('No access token available');
      }

      const url = `${this.baseUrl}/v3/company/${tokens.realmId}${endpoint}`;
      
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }

      console.log(`🔗 Making ${method} request to: ${endpoint}`);
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ QuickBooks API error: ${response.status} - ${errorText}`);
        throw new Error(`QuickBooks API error: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ QuickBooks API request successful: ${endpoint}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ QuickBooks API request failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * Fetch all accounts (categories) from QuickBooks
   */
  async getAccounts() {
    try {
      console.log('📊 Fetching QuickBooks accounts...');
      
      const accounts = await this.makeRequest('/query?query=SELECT * FROM Account WHERE Active = true ORDER BY Name');
      
      console.log(`✅ Found ${accounts.QueryResponse.Account?.length || 0} accounts`);
      
      return accounts.QueryResponse.Account || [];
      
    } catch (error) {
      console.error('❌ Failed to fetch accounts:', error.message);
      throw error;
    }
  },

  /**
   * Fetch all vendors from QuickBooks
   */
  async getVendors() {
    try {
      console.log('🏢 Fetching QuickBooks vendors...');
      
      const vendors = await this.makeRequest('/query?query=SELECT * FROM Vendor WHERE Active = true ORDER BY DisplayName');
      
      console.log(`✅ Found ${vendors.QueryResponse.Vendor?.length || 0} vendors`);
      
      return vendors.QueryResponse.Vendor || [];
      
    } catch (error) {
      console.error('❌ Failed to fetch vendors:', error.message);
      throw error;
    }
  },

  /**
   * Create a bill (invoice) in QuickBooks
   */
  async createBill(invoiceData) {
    try {
      console.log(`💰 Creating QuickBooks bill for invoice: ${invoiceData.invoiceNumber}`);
      
      // Transform PCS AI invoice data to QuickBooks bill format
      const billData = {
        VendorRef: {
          value: invoiceData.vendorId || this.getDefaultVendorId()
        },
        Line: invoiceData.lineItems.map(item => ({
          Amount: item.amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: item.categoryId || this.getDefaultCategoryId()
            }
          }
        })),
        APAccountRef: {
          value: this.getDefaultAPAccountId()
        },
        DocNumber: invoiceData.invoiceNumber,
        TxnDate: invoiceData.invoiceDate,
        DueDate: invoiceData.dueDate,
        PrivateNote: `PCS AI Invoice: ${invoiceData.invoiceNumber}`
      };

      const result = await this.makeRequest('/bill', 'POST', billData);
      
      console.log(`✅ Bill created successfully: ${result.Bill.Id}`);
      
      return result.Bill;
      
    } catch (error) {
      console.error('❌ Failed to create bill:', error.message);
      throw error;
    }
  },

  /**
   * Attach PDF to QuickBooks bill
   */
  async attachPDF(billId, pdfBuffer, fileName) {
    try {
      console.log(`📎 Attaching PDF to bill: ${billId}`);
      
      // Create an Attachable entity
      const attachableData = {
        Note: `Invoice PDF: ${fileName}`,
        AttachableRef: [{
          LineInfo: [{
            TxnLineID: billId
          }],
          TxnType: 'Bill'
        }],
        FileName: fileName,
        ContentType: 'application/pdf'
      };

      const result = await this.makeRequest('/attachable', 'POST', attachableData);
      
      console.log(`✅ PDF attached successfully: ${result.Attachable.Id}`);
      
      return result.Attachable;
      
    } catch (error) {
      console.error('❌ Failed to attach PDF:', error.message);
      throw error;
    }
  },

  /**
   * Get default values (placeholder - implement based on your QuickBooks setup)
   */
  getDefaultVendorId() {
    // TODO: Return your default vendor ID
    return '1';
  },

  getDefaultCategoryId() {
    // TODO: Return your default expense category ID
    return '1';
  },

  getDefaultAPAccountId() {
    // TODO: Return your default Accounts Payable account ID
    return '1';
  },

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    try {
      console.log('🔄 Refreshing QuickBooks access token...');
      
      const tokens = await this.getAccessTokens();
      
      if (!tokens.refreshToken) {
        throw new Error('No refresh token available');
      }

      const tokenEndpoint = this.environment === 'sandbox'
        ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
        : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

      const credentials = process.env.QBO_CLIENT_ID + ':' + process.env.QBO_CLIENT_SECRET;
      const base64Credentials = Buffer.from(credentials).toString('base64');

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${base64Credentials}`,
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken
        }).toString()
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const newTokens = await response.json();
      
      console.log('✅ Access token refreshed successfully');
      
      // TODO: Store new tokens securely
      // await this.storeTokens(newTokens);
      
      return newTokens;
      
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error.message);
      throw error;
    }
  }
};

module.exports = QuickBooksAPI;
