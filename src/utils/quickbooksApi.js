/**
 * QuickBooks API Integration Utilities
 * Handles bidirectional communication between PCS AI and QuickBooks Online
 */

class QuickBooksAPI {
  constructor() {
    this.baseUrl = process.env.REACT_APP_QBO_BASE_URL || 'https://sandbox-quickbooks.api.intuit.com';
    this.clientId = process.env.REACT_APP_QBO_CLIENT_ID;
    this.clientSecret = process.env.REACT_APP_QBO_CLIENT_SECRET;
    this.accessToken = null;
    this.refreshToken = null;
    this.realmId = null;
  }

  // Set authentication tokens (called after OAuth flow)
  setAuthTokens(accessToken, refreshToken, realmId) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.realmId = realmId;
    console.log('🔐 QuickBooks authentication tokens set');
  }

  // Get authorization header for API requests
  getAuthHeader() {
    if (!this.accessToken) {
      throw new Error('No access token available. Please complete OAuth flow first.');
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  // Make authenticated API request to QuickBooks
  async makeRequest(endpoint, options = {}) {
    try {
      const url = `${this.baseUrl}/v3/company/${this.realmId}${endpoint}`;
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getAuthHeader(),
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ QuickBooks API error:', response.status, errorText);
        throw new Error(`QuickBooks API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ QuickBooks API request failed:', error);
      throw error;
    }
  }

  // ===== FROM QUICKBOOKS TO PCS AI =====

  // Get all account categories (Chart of Accounts)
  async getAccountCategories() {
    console.log('📊 Fetching QuickBooks account categories...');
    
    try {
      const response = await this.makeRequest('/query?query=SELECT * FROM Account WHERE Classification = "Expense" ORDER BY Name');
      
      if (response.QueryResponse && response.QueryResponse.Account) {
        const categories = response.QueryResponse.Account.map(account => ({
          id: account.Id,
          name: account.Name,
          type: account.AccountType,
          classification: account.Classification,
          fullyQualifiedName: account.FullyQualifiedName
        }));
        
        console.log(`✅ Retrieved ${categories.length} expense account categories`);
        return categories;
      } else {
        console.log('⚠️ No expense accounts found');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch account categories:', error);
      throw error;
    }
  }

  // Get specific account by name (for exact category matching)
  async getAccountByName(accountName) {
    console.log(`🔍 Searching for QuickBooks account: ${accountName}`);
    
    try {
      const encodedName = encodeURIComponent(accountName);
      const response = await this.makeRequest(`/query?query=SELECT * FROM Account WHERE Name = '${encodedName}'`);
      
      if (response.QueryResponse && response.QueryResponse.Account && response.QueryResponse.Account.length > 0) {
        const account = response.QueryResponse.Account[0];
        console.log(`✅ Found account: ${account.Name} (ID: ${account.Id})`);
        return {
          id: account.Id,
          name: account.Name,
          type: account.AccountType,
          classification: account.Classification,
          fullyQualifiedName: account.FullyQualifiedName
        };
      } else {
        console.log(`⚠️ No account found with name: ${accountName}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to search for account:', error);
      throw error;
    }
  }

  // Get vendor information by name
  async getVendorByName(vendorName) {
    console.log(`🏢 Searching for QuickBooks vendor: ${vendorName}`);
    
    try {
      const encodedName = encodeURIComponent(vendorName);
      const response = await this.makeRequest(`/query?query=SELECT * FROM Vendor WHERE DisplayName = '${encodedName}'`);
      
      if (response.QueryResponse && response.QueryResponse.Vendor && response.QueryResponse.Vendor.length > 0) {
        const vendor = response.QueryResponse.Vendor[0];
        console.log(`✅ Found vendor: ${vendor.DisplayName} (ID: ${vendor.Id})`);
        return {
          id: vendor.Id,
          name: vendor.DisplayName,
          companyName: vendor.CompanyName,
          email: vendor.PrimaryEmailAddr?.Address,
          phone: vendor.PrimaryPhone?.FreeFormNumber
        };
      } else {
        console.log(`⚠️ No vendor found with name: ${vendorName}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to search for vendor:', error);
      throw error;
    }
  }

  // ===== FROM PCS AI TO QUICKBOOKS =====

  // Create a new bill in QuickBooks from PCS AI invoice data
  async createBill(invoiceData) {
    console.log('📝 Creating QuickBooks bill from PCS AI invoice...');
    
    try {
      // First, ensure vendor exists or create it
      let vendor = await this.getVendorByName(invoiceData.vendor);
      if (!vendor) {
        vendor = await this.createVendor(invoiceData.vendor);
      }

      // Prepare bill data
      const billData = {
        VendorRef: {
          value: vendor.id
        },
        APAccountRef: {
          value: "33" // Default Accounts Payable account ID
        },
        DocNumber: invoiceData.invoiceNumber,
        TxnDate: invoiceData.invoiceDate,
        DueDate: invoiceData.dueDate,
        Line: invoiceData.lineItems.map(item => ({
          Amount: parseFloat(item.amount),
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: item.quickbooksCategoryId || "7" // Default expense account if no category
            },
            Description: item.description,
            Amount: parseFloat(item.amount)
          }
        })),
        TotalAmt: parseFloat(invoiceData.totalAmount)
      };

      console.log('📋 Bill data prepared:', billData);

      // Create the bill
      const response = await this.makeRequest('/bill', {
        method: 'POST',
        body: JSON.stringify(billData)
      });

      if (response.Bill) {
        console.log(`✅ Bill created successfully! ID: ${response.Bill.Id}`);
        
        // If there's a PDF attachment, add it
        if (invoiceData.pdfUrl) {
          await this.attachPdfToBill(response.Bill.Id, invoiceData.pdfUrl, invoiceData.invoiceNumber);
        }
        
        return response.Bill;
      } else {
        throw new Error('Failed to create bill - no response data');
      }
    } catch (error) {
      console.error('❌ Failed to create bill:', error);
      throw error;
    }
  }

  // Create a new vendor in QuickBooks
  async createVendor(vendorName) {
    console.log(`🏢 Creating new QuickBooks vendor: ${vendorName}`);
    
    try {
      const vendorData = {
        DisplayName: vendorName,
        CompanyName: vendorName
      };

      const response = await this.makeRequest('/vendor', {
        method: 'POST',
        body: JSON.stringify(vendorData)
      });

      if (response.Vendor) {
        console.log(`✅ Vendor created successfully! ID: ${response.Vendor.Id}`);
        return {
          id: response.Vendor.Id,
          name: response.Vendor.DisplayName,
          companyName: response.Vendor.CompanyName
        };
      } else {
        throw new Error('Failed to create vendor - no response data');
      }
    } catch (error) {
      console.error('❌ Failed to create vendor:', error);
      throw error;
    }
  }

  // Attach PDF to QuickBooks bill
  async attachPdfToBill(billId, pdfUrl, fileName) {
    console.log(`📎 Attaching PDF to bill ${billId}...`);
    
    try {
      // First, download the PDF content
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
      }
      
      await pdfResponse.arrayBuffer();

      // Create attachment data
      const attachmentData = {
        ContentType: "application/pdf",
        FileName: `${fileName}.pdf`,
        Note: `Invoice PDF attachment for bill ${billId}`,
        AttachableRef: [{
          EntityRef: {
            type: "Bill",
            value: billId
          }
        }]
      };

      // Create the attachment
      const response = await this.makeRequest('/attachable', {
        method: 'POST',
        body: JSON.stringify(attachmentData)
      });

      if (response.Attachable) {
        console.log(`✅ PDF attached successfully! ID: ${response.Attachable.Id}`);
        return response.Attachable;
      } else {
        throw new Error('Failed to create attachment - no response data');
      }
    } catch (error) {
      console.error('❌ Failed to attach PDF:', error);
      throw error;
    }
  }

  // ===== UTILITY FUNCTIONS =====

  // Refresh access token if expired
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    console.log('🔄 Refreshing QuickBooks access token...');
    
    try {
      const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      
      console.log('✅ Access token refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error);
      throw error;
    }
  }

  // Check if current access token is valid
  async validateToken() {
    try {
      await this.makeRequest('/companyinfo/1');
      return true;
    } catch (error) {
      if (error.message.includes('401')) {
        console.log('⚠️ Access token expired, attempting refresh...');
        return await this.refreshAccessToken();
      }
      return false;
    }
  }
}

// Export singleton instance
const quickbooksAPI = new QuickBooksAPI();
export default quickbooksAPI;

// Export the class for testing
export { QuickBooksAPI };
