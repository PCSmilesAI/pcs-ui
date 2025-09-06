import { qboClient } from './qboClient';
import fs from 'fs';
import path from 'path';

export interface InvoiceData {
  invoice_number: string;
  vendor: string;
  total: string;
  invoice_date: string;
  due_date?: string;
  pdf_path: string;
  json_path: string;
  line_items?: Array<{
    description?: string;
    name?: string;
    amount?: string;
    total?: string;
    quantity?: string;
  }>;
}

export class AutoBillService {
  private isProcessing = false;

  async processApprovedInvoice(invoiceData: InvoiceData): Promise<{
    success: boolean;
    billId?: string;
    error?: string;
  }> {
    if (this.isProcessing) {
      return {
        success: false,
        error: 'Another invoice is being processed'
      };
    }

    this.isProcessing = true;

    try {
      console.log('🔄 AutoBillService: Processing approved invoice:', invoiceData.invoice_number);

      // Load detailed invoice data from JSON if available
      let detailedData = invoiceData;
      if (invoiceData.json_path && fs.existsSync(invoiceData.json_path)) {
        try {
          const jsonData = JSON.parse(fs.readFileSync(invoiceData.json_path, 'utf8'));
          detailedData = { ...invoiceData, ...jsonData };
        } catch (error) {
          console.warn('⚠️ Could not load detailed JSON data:', error);
        }
      }

      // Prepare the request data
      const requestData = {
        invoiceData: detailedData,
        pdfPath: invoiceData.pdf_path,
        vendorName: invoiceData.vendor,
        invoiceNumber: invoiceData.invoice_number,
        totalAmount: parseFloat(invoiceData.total),
        invoiceDate: this.formatDate(invoiceData.invoice_date),
        dueDate: invoiceData.due_date ? this.formatDate(invoiceData.due_date) : undefined
      };

      // Call the create-bill API
      const response = await fetch('/api/qbo/create-bill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ AutoBillService: Bill created successfully:', result.billId);
        return {
          success: true,
          billId: result.billId
        };
      } else {
        console.error('❌ AutoBillService: Failed to create bill:', result.error);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error: any) {
      console.error('❌ AutoBillService: Error processing invoice:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    } finally {
      this.isProcessing = false;
    }
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch (error) {
      console.warn('⚠️ Invalid date format:', dateString);
      return new Date().toISOString().split('T')[0];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await qboClient.initialize();
      return await qboClient.testConnection();
    } catch (error) {
      console.error('❌ AutoBillService: Connection test failed:', error);
      return false;
    }
  }

  async getDentalCategories(): Promise<any[]> {
    try {
      await qboClient.initialize();
      return await qboClient.getDentalItems();
    } catch (error) {
      console.error('❌ AutoBillService: Failed to get dental categories:', error);
      return [];
    }
  }
}

// Export singleton instance
export const autoBillService = new AutoBillService();
