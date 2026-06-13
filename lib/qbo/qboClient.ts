import { tokenStorage, QBOTokens } from './tokenStorage';

export interface QBOBill {
  Id?: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  VendorRef: {
    value: string;
    name?: string;
  };
  APAccountRef?: {
    value: string;
    name?: string;
  };
  PrivateNote?: string;
  Memo?: string;
  Line: Array<{
    LineNum?: number;
    Amount: number;
    Description?: string;
    DetailType: 'AccountBasedExpenseLineDetail';
    AccountBasedExpenseLineDetail: {
      AccountRef: {
        value: string;
        name?: string;
      };
      ClassRef?: {
        value: string;
      };
    };
  }>;
  DepartmentRef?: {
    value: string;
    name?: string;
  };
  AttachRef?: Array<{
    EntityRef: {
      value: string;
      name: string;
    };
  }>;
}

export interface QBOItem {
  Id: string;
  Name: string;
  Type: string;
  IncomeAccountRef?: {
    value: string;
    name: string;
  };
  ExpenseAccountRef?: {
    value: string;
    name: string;
  };
}

export class QBOClient {
  private tokens: QBOTokens | null = null;
  private refreshPromise: Promise<void> | null = null;

  private getBaseUrl(): string {
    const environment = process.env.QBO_ENVIRONMENT || 'sandbox';
    return environment === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';
  }

  async initialize(): Promise<void> {
    if (!this.tokens) {
      this.tokens = await tokenStorage.getLatestTokens();
    }

    if (!this.tokens) {
      throw new Error('No QuickBooks tokens found. Please connect to QuickBooks first.');
    }

    if (process.env.NODE_ENV === 'production') {
      const { tokenRefreshService } = await import('./tokenRefreshService');
      tokenRefreshService.start();
    }
  }

  async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      await this.initialize();
    }

    if (!this.tokens) {
      throw new Error('No QuickBooks tokens available');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresSoon = now >= (this.tokens.expiresAt - 300);

    if (expiresSoon) {
      // Single-flight: if a refresh is already in progress, await it instead of starting another
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken().finally(() => {
          this.refreshPromise = null;
        });
      }
      await this.refreshPromise;
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available for QuickBooks');
    }

    // IMPORTANT: Keep a backup of the old token in case refresh fails
    const oldTokens = { ...this.tokens };
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] [QBO_REFRESH] Starting token refresh...`, {
      realmId: oldTokens.realmId,
      currentExpiresAt: new Date(oldTokens.expiresAt * 1000).toISOString(),
      hasRefreshToken: !!oldTokens.refreshToken,
    });

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
      });

      const credentials = Buffer.from(
        `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`,
      ).toString('base64');

      const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${timestamp}] [QBO_REFRESH] ❌ Token refresh API failed:`, {
          status: response.status,
          error: errorText.slice(0, 500),
        });
        
        // DON'T clear tokens on refresh failure - keep the old ones
        // They might still work or we might be able to retry
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const payload = await response.json();
      
      // Validate the response has required fields
      if (!payload.access_token) {
        console.error(`[${timestamp}] [QBO_REFRESH] ❌ Invalid refresh response - no access_token`);
        throw new Error('Token refresh response missing access_token');
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.expires_in ?? 3600;
      const expiresAt = now + expiresIn;

      // Use new refresh token if provided, otherwise keep the old one
      const newRefreshToken = payload.refresh_token || this.tokens.refreshToken;

      // Save to persistent storage first
      await tokenStorage.saveTokens({
        realmId: this.tokens.realmId,
        accessToken: payload.access_token,
        refreshToken: newRefreshToken,
        expiresIn,
      });

      // Only update in-memory tokens after successful save
      this.tokens = {
        realmId: this.tokens.realmId,
        accessToken: payload.access_token,
        refreshToken: newRefreshToken,
        expiresIn,
        expiresAt,
      };

      console.log(`[${timestamp}] [QBO_REFRESH] ✅ Token refreshed successfully`, {
        newExpiresAt: new Date(expiresAt * 1000).toISOString(),
        expiresInMinutes: Math.floor(expiresIn / 60),
        refreshTokenUpdated: !!payload.refresh_token,
      });
    } catch (error: any) {
      console.error(`[${timestamp}] [QBO_REFRESH] ❌ Failed to refresh QBO token:`, error.message);
      
      // IMPORTANT: Do NOT clear tokens on failure!
      // Keep the old token - it might still be valid or usable
      // Only log the error and let the caller decide what to do
      console.log(`[${timestamp}] [QBO_REFRESH] Keeping old token (may still be valid)`);
      
      throw new Error(`Failed to refresh QuickBooks token: ${error.message}. Please reconnect at /api/qbo/auth`);
    }
  }

  private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    await this.ensureValidToken();

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v3/company/${this.tokens!.realmId}/${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.tokens!.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    let response = await fetch(url, options);

    if (response.status === 401) {
      try {
        // Reload tokens from disk first — a reconnection may have saved new tokens
        // while this process still has stale ones in memory
        console.warn('QBO 401 received — reloading tokens from disk before retry...');
        const freshTokens = await tokenStorage.getLatestTokens();
        if (freshTokens && freshTokens.accessToken !== this.tokens?.accessToken) {
          console.log('[QBO] Found newer tokens on disk, using those');
          this.tokens = freshTokens;
          headers.Authorization = `Bearer ${this.tokens.accessToken}`;
          response = await fetch(url, options);
        } else {
          console.warn('[QBO] No newer tokens on disk, attempting refresh...');
          await this.refreshToken();
          headers.Authorization = `Bearer ${this.tokens!.accessToken}`;
          response = await fetch(url, options);
        }
      } catch (refreshError) {
        console.error('QBO token refresh/reload failed:', refreshError);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`QBO API Error (${response.status}):`, errorText);
      throw new Error(`QBO API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  private escapeQueryValue(value: string): string {
    // SECURITY: Escape backslashes first, then quotes to prevent incomplete escaping
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async query<T = any>(sql: string, minorVersion = '65'): Promise<T> {
    const encoded = encodeURIComponent(sql);
    return this.makeRequest(`query?query=${encoded}&minorversion=${minorVersion}`, 'GET');
  }

  /** Public SQL query for maintenance scripts (e.g. bill remediation). */
  async executeQuery<T = any>(sql: string, minorVersion = '70'): Promise<T> {
    return this.query<T>(sql, minorVersion);
  }

  async getItems(): Promise<QBOItem[]> {
    const response = await this.query<{ QueryResponse?: { Item?: QBOItem[] } }>(
      'select Id, Name, Type, IncomeAccountRef, ExpenseAccountRef from Item'
    );
    return response.QueryResponse?.Item || [];
  }

  // getAllAccounts is defined later with richer typing

  async getDentalItems(): Promise<QBOItem[]> {
    const items = await this.getItems();
    return items.filter((item) => {
      if (item.Type !== 'Service') return false;
      const name = typeof item.Name === 'string' ? item.Name.toLowerCase() : '';
      if (!name) return false;

      return (
        name.includes('dental') ||
        name.includes('supply') ||
        name.includes('equipment') ||
        name.includes('lab') ||
        name.includes('crown') ||
        name.includes('filling') ||
        name.includes('cleaning') ||
        name.includes('x-ray') ||
        name.includes('orthodontic')
      );
    });
  }

  async findVendorByName(name: string): Promise<any | null> {
    if (!name) return null;
    const safe = this.escapeQueryValue(name);
    const response = await this.query(`select * from Vendor where DisplayName = '${safe}'`);
    return response.QueryResponse?.Vendor?.[0] || null;
  }

  async createVendor(name: string): Promise<any> {
    const payload = {
      DisplayName: name,
      CompanyName: name,
    };

    const response = await this.makeRequest('vendor?minorversion=65', 'POST', payload);
    return response.Vendor;
  }

  async ensureVendor(name: string): Promise<any> {
    const existing = await this.findVendorByName(name);
    if (existing) return existing;

    // Fuzzy fallback before creating: case-insensitive and substring matching
    try {
      const fuzzyMatch = await this.findVendor(name);
      if (fuzzyMatch) {
        console.log(`[QBO] Fuzzy matched vendor "${name}" -> "${fuzzyMatch.name}" (ID: ${fuzzyMatch.id})`);
        return { Id: fuzzyMatch.id, DisplayName: fuzzyMatch.name };
      }
    } catch {
      // findVendor throws when no match is found — fall through to create
    }

    return this.createVendor(name);
  }

  async getAccountsPayableAccount(): Promise<any | null> {
    const query = "select * from Account where AccountType = 'Accounts Payable'";
    const response = await this.query(query);
    return response.QueryResponse?.Account?.[0] || null;
  }

  async createBill(bill: QBOBill): Promise<any> {
    const response = await this.makeRequest('bill?minorversion=70', 'POST', bill);
    return response?.Bill || response;
  }

  async updateBill(bill: { Id: string; SyncToken: string; sparse?: boolean; [key: string]: any }): Promise<any> {
    // QBO requires Id and SyncToken for updates
    if (!bill.Id || !bill.SyncToken) {
      throw new Error('Bill update requires Id and SyncToken');
    }
    const response = await this.makeRequest('bill?minorversion=70', 'POST', bill);
    return response?.Bill || response;
  }

  async uploadAttachment(billId: string, fileName: string, fileContent: ArrayBuffer | Uint8Array | Buffer, mimeType: string): Promise<any> {
    await this.ensureValidToken();

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v3/company/${this.tokens!.realmId}/upload?minorversion=65`;

    const formData = new FormData();
    const metadata = {
      AttachableRef: [
        {
          EntityRef: {
            value: billId,
            type: 'Bill',
          },
        },
      ],
      FileName: fileName,
    };

    formData.append('file_metadata_01', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
    const bytes: Uint8Array =
      fileContent instanceof ArrayBuffer
        ? new Uint8Array(fileContent)
        : fileContent instanceof Uint8Array
          ? fileContent
          : new Uint8Array((fileContent as Buffer).buffer, (fileContent as Buffer).byteOffset, (fileContent as Buffer).byteLength);
    const arrayBuffer: ArrayBuffer =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    formData.append('file_content_01', new Blob([arrayBuffer], { type: mimeType }), fileName);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        Accept: 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`QBO Attachment Error (${response.status}):`, errorText);
      throw new Error(`QBO Attachment Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getCompanyInfo(): Promise<any> {
    const response = await this.makeRequest('companyinfo/1?minorversion=65');
    return response.QueryResponse?.CompanyInfo?.[0];
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getCompanyInfo();
      return true;
    } catch (error) {
      console.error('QBO Connection test failed:', error);
      return false;
    }
  }

  async findVendor(vendorName: string): Promise<{ id: string; name: string }> {
    try {
      console.log(`🔍 Looking up existing vendor: ${vendorName}`);
      const response = await this.query("SELECT Id, Name FROM Vendor WHERE Active = true");
      const vendors = response.QueryResponse?.Vendor || [];

      let vendor = vendors.find((v: any) => v.Name === vendorName);
      if (!vendor) {
        vendor = vendors.find((v: any) => v.Name.toLowerCase() === vendorName.toLowerCase());
      }
      if (!vendor) {
        vendor = vendors.find((v: any) =>
          v.Name.toLowerCase().includes(vendorName.toLowerCase()) ||
          vendorName.toLowerCase().includes(v.Name.toLowerCase())
        );
      }

      if (vendor) {
        console.log(`✅ Found vendor: ${vendor.Name} (ID: ${vendor.Id})`);
        return { id: vendor.Id, name: vendor.Name };
      }

      console.log('📋 Available vendors:', vendors.map((v: any) => v.Name).slice(0, 20));
      throw new Error(`Vendor "${vendorName}" not found in QuickBooks.`);
    } catch (error) {
      console.error('❌ Error finding vendor:', error);
      throw error;
    }
  }

  async getAPAccount(): Promise<{ id: string; name: string } | null> {
    try {
      const response = await this.query("SELECT Id, Name, AccountType FROM Account WHERE Active = true");
      const accounts = response.QueryResponse?.Account || [];
      const apAccount = accounts.find((acc: any) => acc.AccountType === 'Accounts Payable');

      if (apAccount) {
        return { id: apAccount.Id, name: apAccount.Name };
      }

      console.error('❌ No Accounts Payable account found');
      return null;
    } catch (error) {
      console.error('❌ Error getting AP account:', error);
      return null;
    }
  }

  async getExpenseAccounts(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      const accounts = await this.getAllAccounts();

      const expenseAccounts = accounts.filter((acc) =>
        acc.type === 'Expense' ||
        acc.type === 'Cost of Goods Sold' ||
        acc.type === 'Other Expense'
      );

      return expenseAccounts.map((account) => ({
        id: account.id,
        name: account.fullName || account.name,
        type: account.type,
      }));
    } catch (error) {
      console.error('❌ Error getting expense accounts:', error);
      return [];
    }
  }

  async getAllAccounts(): Promise<Array<{ id: string; name: string; fullName: string; type: string; subType?: string; acctNum?: string }>> {
    try {
      const allAccounts: Array<{ id: string; name: string; fullName: string; type: string; subType?: string; acctNum?: string }> = [];
      let startPosition = 1;
      const maxResults = 1000;
      let hasMore = true;

      while (hasMore) {
        const response = await this.query(
          `SELECT Id, Name, AcctNum, AccountType, AccountSubType, FullyQualifiedName FROM Account WHERE Active = true STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`
        );
        const accounts = response.QueryResponse?.Account || [];

        if (accounts.length === 0) {
          hasMore = false;
        } else {
          allAccounts.push(...accounts.map((account: any) => ({
            id: account.Id,
            name: account.Name,
            acctNum: account.AcctNum || undefined,
            fullName: account.FullyQualifiedName || account.Name,
            type: account.AccountType,
            subType: account.AccountSubType,
          })));

          if (accounts.length < maxResults) {
            hasMore = false;
          } else {
            startPosition += maxResults;
          }
        }
      }

      return allAccounts;
    } catch (error) {
      console.error('❌ Error getting all accounts:', error);
      return [];
    }
  }

  async getClasses(): Promise<Array<{ id: string; name: string; fullName: string }>> {
    try {
      const response = await this.query("SELECT Id, Name, FullyQualifiedName FROM Class WHERE Active = true");
      const classes = response.QueryResponse?.Class || [];
      return (classes || []).map((c: any) => ({
        id: c.Id,
        name: c.Name,
        fullName: c.FullyQualifiedName || c.Name,
      }));
    } catch (error) {
      console.error('❌ Error getting classes:', error);
      return [];
    }
  }

  async getLocations(): Promise<Array<{ id: string; name: string; fullName: string }>> {
    try {
      const response = await this.query("SELECT Id, Name, FullyQualifiedName FROM Department WHERE Active = true");
      const departments = response.QueryResponse?.Department || [];
      return (departments || []).map((dept: any) => ({
        id: dept.Id,
        name: dept.Name,
        fullName: dept.FullyQualifiedName || dept.Name,
      }));
    } catch (error) {
      console.error('❌ Error getting locations (Department):', error);
      return [];
    }
  }

  async getAllVendors(): Promise<Array<{ id: string; name: string; displayName: string }>> {
    try {
      // QBO API returns max 100 results by default, so we need to paginate
      const allVendors: Array<{ id: string; name: string; displayName: string }> = [];
      let startPosition = 1;
      const maxResults = 1000; // Request more at once
      let hasMore = true;
      
      while (hasMore) {
        const response = await this.query(
          `SELECT Id, DisplayName FROM Vendor WHERE Active = true STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`
        );
        const vendors = response.QueryResponse?.Vendor || [];
        
        if (vendors.length === 0) {
          hasMore = false;
        } else {
          allVendors.push(...vendors.map((v: any) => ({
            id: v.Id,
            name: v.DisplayName,
            displayName: v.DisplayName,
          })));
          
          // If we got fewer than maxResults, we've reached the end
          if (vendors.length < maxResults) {
            hasMore = false;
          } else {
            startPosition += maxResults;
          }
        }
      }
      
      console.log(`[QBO] Loaded ${allVendors.length} vendors`);
      return allVendors;
    } catch (error) {
      console.error('❌ Error getting all vendors:', error);
      return [];
    }
  }

  /**
   * Get a Bill by its QBO ID
   * Returns the bill object with Balance field (0 = fully paid)
   */
  async getBillById(billId: string): Promise<{
    Id: string;
    Balance: number;
    TotalAmt: number;
    DocNumber?: string;
    VendorRef?: { value: string; name?: string };
    DueDate?: string;
    SyncToken?: string;
    PrivateNote?: string;
    Memo?: string;
  } | null> {
    try {
      const safe = this.escapeQueryValue(billId);
      const response = await this.query(`SELECT * FROM Bill WHERE Id = '${safe}'`);
      const bill = response.QueryResponse?.Bill?.[0];
      if (!bill) {
        console.warn(`Bill with ID ${billId} not found in QBO`);
        return null;
      }
      return {
        Id: bill.Id,
        Balance: bill.Balance ?? bill.TotalAmt ?? 0,
        TotalAmt: bill.TotalAmt ?? 0,
        DocNumber: bill.DocNumber,
        VendorRef: bill.VendorRef,
        DueDate: bill.DueDate,
        SyncToken: bill.SyncToken,
        PrivateNote: bill.PrivateNote,
        Memo: bill.Memo,
      };
    } catch (error) {
      console.error(`❌ Error getting bill by ID ${billId}:`, error);
      return null;
    }
  }

  async getFullBill(billId: string): Promise<any | null> {
    try {
      const response = await this.makeRequest(`bill/${billId}?minorversion=70`, 'GET');
      return response?.Bill || null;
    } catch (error) {
      console.error(`❌ Error getting full bill ${billId}:`, error);
      return null;
    }
  }

  async createAccount(account: {
    Name: string;
    AcctNum?: string;
    AccountType: string;
    AccountSubType?: string;
    SubAccount?: boolean;
    ParentRef?: { value: string };
  }): Promise<any> {
    const response = await this.makeRequest('account?minorversion=70', 'POST', account);
    return response?.Account || response;
  }

  /**
   * Check if a bill has been paid (Balance = 0)
   */
  async isBillPaid(billId: string): Promise<boolean> {
    const bill = await this.getBillById(billId);
    if (!bill) return false;
    return bill.Balance === 0;
  }

  /**
   * Delete a bill from QBO. Requires the bill's Id and SyncToken.
   * QBO treats this as a hard delete — the bill will no longer appear.
   */
  async deleteBill(billId: string, syncToken: string): Promise<any> {
    const response = await this.makeRequest(
      'bill?operation=delete&minorversion=70',
      'POST',
      { Id: billId, SyncToken: syncToken }
    );
    return response;
  }

  /**
   * Query QBO bills by a partial memo match. Returns raw Bill objects.
   */
  async queryBillsByMemo(memoSubstring: string): Promise<any[]> {
    const bills: any[] = [];
    let startPosition = 1;
    const maxResults = 1000;

    while (true) {
      const query = `SELECT * FROM Bill WHERE PrivateNote LIKE '%${memoSubstring}%' STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      const response = await this.makeRequest(
        `query?query=${encodeURIComponent(query)}&minorversion=70`,
        'GET'
      );
      const page = response?.QueryResponse?.Bill || [];
      bills.push(...page);
      if (page.length < maxResults) break;
      startPosition += maxResults;
    }

    return bills;
  }
}

export const qboClient = new QBOClient();
