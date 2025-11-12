import fs from 'fs';
import path from 'path';
import { qboClient } from './qboClient';
import { createBillFromInvoice, InvoiceData as BillInvoiceData } from './billCreationService';
import { isPathWithinBase } from '../security/path-validation';

export type InvoiceData = BillInvoiceData & {
  invoice_number: string;
  vendor: string;
  total: string;
  invoice_date: string;
  due_date?: string;
  pdf_path: string;
  json_path: string;
};
function parseAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number.parseFloat(trimmed.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export class AutoBillService {
  private isProcessing = false;
  private processingStart = 0;

  async processApprovedInvoice(
    invoiceData: InvoiceData,
    meta: { dryRun?: boolean } = {}
  ): Promise<{
    success: boolean;
    billId?: string;
    pdfAttached?: boolean;
    categories?: Array<{ description: string; category: string }>;
    // Enriched dry-run preview fields
    lineCount?: number;
    vendor?: string | null;
    accounts?: Array<string | null>;
    classRefs?: Array<string | null>;
    error?: string;
  }> {
    const now = Date.now();
    if (this.isProcessing) {
      const elapsed = now - this.processingStart;
      if (elapsed < 120_000) {
        return {
          success: false,
          error: 'Another invoice is being processed'
        };
      }

      console.warn('⚠️ AutoBillService: previous processing still marked active after', elapsed, 'ms. Resetting lock.');
      this.isProcessing = false;
    }

    this.isProcessing = true;
    this.processingStart = now;

    try {
      console.log('🔄 AutoBillService: Processing approved invoice:', invoiceData.invoice_number);
      let detailedData: BillInvoiceData = { ...invoiceData };

      // SECURITY: Validate json_path to prevent path traversal attacks
      if (invoiceData.json_path && typeof invoiceData.json_path === 'string') {
        const baseDir = process.cwd();
        // SECURITY: Resolve and validate the path to ensure it's within the base directory
        const resolvedPath = path.resolve(invoiceData.json_path);

        // SECURITY: Only proceed if path is within base directory
        if (isPathWithinBase(resolvedPath, baseDir)) {
          try {
            // SECURITY: Path has been validated, safe to use
            if (fs.existsSync(resolvedPath)) {
              const jsonData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
              detailedData = { ...detailedData, ...jsonData };
            }
          } catch (error) {
            console.warn('⚠️ Could not load detailed JSON data:', error);
          }
        } else {
          console.error('❌ Path traversal attempt detected in json_path:', invoiceData.json_path);
        }
      }

      detailedData = {
        ...detailedData,
        invoice_number: invoiceData.invoice_number || detailedData.invoice_number,
        invoiceNumber: invoiceData.invoice_number || detailedData.invoiceNumber,
        vendor: invoiceData.vendor || detailedData.vendor,
        vendorName: invoiceData.vendor || detailedData.vendorName,
        pdf_path: invoiceData.pdf_path || detailedData.pdf_path,
        pdfPath: invoiceData.pdf_path || detailedData.pdfPath,
        invoice_date: invoiceData.invoice_date || detailedData.invoice_date,
        invoiceDate: invoiceData.invoice_date || detailedData.invoiceDate,
        due_date: invoiceData.due_date ?? detailedData.due_date,
        dueDate: invoiceData.due_date ?? detailedData.dueDate,
        total: invoiceData.total || detailedData.total,
        amount: invoiceData.total || detailedData.amount,
        totalAmount: invoiceData.total || detailedData.totalAmount,
        line_items: detailedData.line_items || detailedData.lineItems || invoiceData.line_items || []
      };

      const parsedAmount = parseAmount(invoiceData.total);
      const result = await createBillFromInvoice({
        invoiceData: detailedData,
        vendorName: invoiceData.vendor || detailedData.vendor || detailedData.vendorName,
        invoiceNumber: invoiceData.invoice_number || detailedData.invoice_number || detailedData.invoiceNumber,
        invoiceDate: invoiceData.invoice_date || detailedData.invoice_date || detailedData.invoiceDate,
        dueDate: invoiceData.due_date ?? detailedData.due_date ?? detailedData.dueDate,
        pdfPath: invoiceData.pdf_path || detailedData.pdf_path || detailedData.pdfPath,
        totalAmount: typeof parsedAmount === 'number' ? parsedAmount : undefined,
        dryRun: meta.dryRun,
      });
      if (result.success) {
        console.log('✅ AutoBillService: Bill created successfully:', result.billId);
        return {
          success: true,
          billId: result.billId,
          pdfAttached: result.pdfAttached,
          categories: result.categories,
          lineCount: result.lineCount,
          vendor: result.vendor ?? (invoiceData.vendor || detailedData.vendor),
          accounts: result.accounts,
          classRefs: result.classRefs,
        };
      }

      console.error('❌ AutoBillService: Failed to create bill:', result.error);
      return {
        success: false,
        error: result.error
      };

    } catch (error: any) {
      console.error('❌ AutoBillService: Error processing invoice:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    } finally {
      this.isProcessing = false;
      this.processingStart = 0;
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
