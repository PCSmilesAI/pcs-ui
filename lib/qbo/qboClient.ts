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
      console.log('🔄 QBO token expiring soon, refreshing…');
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available for QuickBooks');
    }

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
        console.error('❌ Token refresh failed:', response.status, errorText);
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const payload = await response.json();
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.expires_in ?? 3600;
      const expiresAt = now + expiresIn;

      await tokenStorage.saveTokens({
        realmId: this.tokens.realmId,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || this.tokens.refreshToken,
        expiresIn,
      });

      this.tokens = {
        realmId: this.tokens.realmId,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || this.tokens.refreshToken,
        expiresIn,
        expiresAt,
      };

      console.log('✅ QBO token refreshed successfully.');
    } catch (error: any) {
      console.error('❌ Failed to refresh QBO token:', error);
      this.tokens = null;
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
        console.warn('QBO 401 received — attempting token refresh and retry...');
        await this.refreshToken();
        headers.Authorization = `Bearer ${this.tokens!.accessToken}`;
        response = await fetch(url, options);
      } catch (refreshError) {
        console.error('QBO token refresh failed:', refreshError);
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
      const response = await this.query("SELECT Id, Name, AccountType, AccountSubType, FullyQualifiedName FROM Account WHERE Active = true");
      const accounts = response.QueryResponse?.Account || [];

      const expenseAccounts = accounts.filter((acc: any) =>
        acc.AccountType === 'Expense' ||
        acc.AccountType === 'Cost of Goods Sold' ||
        acc.AccountType === 'Other Expense'
      );

      return expenseAccounts.map((account: any) => ({
        id: account.Id,
        name: account.FullyQualifiedName || account.Name,
        type: account.AccountType,
      }));
    } catch (error) {
      console.error('❌ Error getting expense accounts:', error);
      return [];
    }
  }

  async getAllAccounts(): Promise<Array<{ id: string; name: string; fullName: string; type: string; subType?: string; acctNum?: string }>> {
    try {
      const response = await this.query(
        'SELECT Id, Name, AcctNum, AccountType, AccountSubType, FullyQualifiedName FROM Account WHERE Active = true'
      );
      const accounts = response.QueryResponse?.Account || [];

      return accounts.map((account: any) => ({
        id: account.Id,
        name: account.Name,
        acctNum: account.AcctNum || undefined,
        fullName: account.FullyQualifiedName || account.Name,
        type: account.AccountType,
        subType: account.AccountSubType,
      }));
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
}

export const qboClient = new QBOClient();
