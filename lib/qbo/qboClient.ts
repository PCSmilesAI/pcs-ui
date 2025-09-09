import { tokenStorage, QBOTokens } from './tokenStorage';
import { oauth2 } from './oauthClient';

export interface QBOBill {
  Id?: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  VendorRef: {
    value: string;
    name: string;
  };
  Line: Array<{
    Id?: string;
    LineNum?: number;
    Amount: number;
    DetailType: 'ItemBasedExpenseLineDetail';
    ItemBasedExpenseLineDetail: {
      ItemRef: {
        value: string;
        name: string;
      };
      Qty: number;
      UnitPrice: number;
    };
  }>;
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

  async initialize(): Promise<void> {
    this.tokens = await tokenStorage.getLatestTokens();
    if (!this.tokens) {
      throw new Error('No QuickBooks tokens found. Please connect to QuickBooks first.');
    }
  }

  async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      await this.initialize();
    }

    if (!this.tokens) {
      throw new Error('No QuickBooks tokens available');
    }

    // Check if token is expired
    if (await tokenStorage.isTokenExpired(this.tokens)) {
      console.log('🔄 QBO Token expired, refreshing...');
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('No tokens available to refresh');
    }

    try {
      const { token } = await oauth2.getToken({
        refresh_token: this.tokens.refreshToken,
        grant_type: 'refresh_token'
      });

      // Update stored tokens
      await tokenStorage.saveTokens({
        realmId: this.tokens.realmId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in
      });

      // Update current tokens
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + token.expires_in;
      
      this.tokens = {
        realmId: this.tokens.realmId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        expiresAt
      };

      console.log('✅ QBO Token refreshed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh QBO token:', error);
      throw new Error('Failed to refresh QuickBooks token. Please reconnect.');
    }
  }

  private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    await this.ensureValidToken();

    const url = `https://quickbooks.api.intuit.com/v3/company/${this.tokens!.realmId}/${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.tokens!.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`QBO API Error (${response.status}):`, errorText);
        throw new Error(`QBO API Error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('QBO API Request failed:', error);
      throw error;
    }
  }

  // Get all items (for category mapping)
  async getItems(): Promise<QBOItem[]> {
    const response = await this.makeRequest('items?minorversion=65');
    return response.QueryResponse?.Item || [];
  }

  // Get dental-specific items/categories
  async getDentalItems(): Promise<QBOItem[]> {
    const items = await this.getItems();
    return items.filter(item => 
      item.Type === 'Service' && 
      (item.Name.toLowerCase().includes('dental') || 
       item.Name.toLowerCase().includes('supply') ||
       item.Name.toLowerCase().includes('equipment') ||
       item.Name.toLowerCase().includes('lab') ||
       item.Name.toLowerCase().includes('crown') ||
       item.Name.toLowerCase().includes('filling') ||
       item.Name.toLowerCase().includes('cleaning') ||
       item.Name.toLowerCase().includes('x-ray') ||
       item.Name.toLowerCase().includes('orthodontic'))
    );
  }

  // Create a new bill
  async createBill(bill: QBOBill): Promise<any> {
    const response = await this.makeRequest('purchases', 'POST', bill);
    return response.PurchaseResponse?.Purchase?.[0];
  }

  // Upload attachment to a bill
  async uploadAttachment(billId: string, fileName: string, fileContent: Buffer, mimeType: string): Promise<any> {
    // This would require the Attachments API
    // For now, we'll return a placeholder
    console.log(`📎 Would upload attachment ${fileName} to bill ${billId}`);
    return { success: true, message: 'Attachment upload not yet implemented' };
  }

  // Get company info
  async getCompanyInfo(): Promise<any> {
    const response = await this.makeRequest('companyinfo/1?minorversion=65');
    return response.QueryResponse?.CompanyInfo?.[0];
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.getCompanyInfo();
      return true;
    } catch (error) {
      console.error('QBO Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const qboClient = new QBOClient();
