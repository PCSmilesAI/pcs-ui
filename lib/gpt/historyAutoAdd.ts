/**
 * Auto-add invoices to vendor history when they reach confirmed status
 * 
 * This module provides a function to automatically add invoices to the
 * vendor history database when they are approved/paid, enabling few-shot
 * learning for future invoice parsing.
 */

import { addToHistory, isInvoiceInHistory } from './vendorHistory';
import { convertPdfToBase64Images } from './pdfToImages';
import * as path from 'path';
import * as fs from 'fs';

// Statuses that indicate an invoice is confirmed and should be added to history
const CONFIRMED_STATUSES = ['to_be_paid', 'paid'];

interface InvoiceForHistory {
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  vendor?: string | null;
  vendor_name?: string | null;
  total?: number | string | null;
  invoice_total?: number | string | null;
  office_location?: string | null;
  office?: string | null;
  line_items?: any[];
  pdf_path?: string | null;
  source_file?: string | null;
  status?: string | null;
}

/**
 * Check if an invoice should be added to history and add it if so
 * 
 * This function:
 * 1. Checks if the invoice status is 'to_be_paid' or 'paid'
 * 2. Checks if the invoice is already in history
 * 3. Converts the PDF to images
 * 4. Adds to the vendor's history database
 * 
 * Call this after saving an invoice that has been approved or paid.
 */
export async function maybeAddToHistory(invoice: InvoiceForHistory): Promise<{
  added: boolean;
  reason?: string;
  error?: string;
}> {
  try {
    // Check status
    const status = (invoice.status || '').toLowerCase();
    if (!CONFIRMED_STATUSES.includes(status)) {
      return { added: false, reason: `Status '${status}' not in confirmed list` };
    }

    // Get vendor name
    const vendorName = invoice.vendor || invoice.vendor_name;
    if (!vendorName || vendorName === 'Unknown') {
      return { added: false, reason: 'No vendor name available' };
    }

    // Get invoice number
    const invoiceNumber = invoice.invoice_number || null;

    // Check if already in history
    if (invoiceNumber && isInvoiceInHistory(vendorName, invoiceNumber)) {
      return { added: false, reason: 'Invoice already in history' };
    }

    // Get PDF path
    const pdfPath = invoice.pdf_path || invoice.source_file;
    if (!pdfPath) {
      return { added: false, reason: 'No PDF path available' };
    }

    // Resolve full path
    let fullPdfPath = pdfPath;
    if (!path.isAbsolute(pdfPath)) {
      fullPdfPath = path.join(process.cwd(), pdfPath);
    }

    // Check if file exists
    if (!fs.existsSync(fullPdfPath)) {
      // Try common locations
      const possiblePaths = [
        path.join(process.cwd(), 'email_invoices', path.basename(pdfPath)),
        path.join(process.cwd(), 'public', pdfPath),
        path.join(process.cwd(), 'sample_invoices_pcs', path.basename(pdfPath)),
      ];
      
      let found = false;
      for (const tryPath of possiblePaths) {
        if (fs.existsSync(tryPath)) {
          fullPdfPath = tryPath;
          found = true;
          break;
        }
      }
      
      if (!found) {
        return { added: false, reason: `PDF file not found: ${pdfPath}` };
      }
    }

    // Convert PDF to images
    console.log(`[HISTORY-AUTO] Converting PDF for ${vendorName}: ${fullPdfPath}`);
    let images: string[];
    try {
      images = await convertPdfToBase64Images(fullPdfPath);
    } catch (convertError: any) {
      console.error('[HISTORY-AUTO] PDF conversion failed:', convertError.message);
      return { added: false, error: `PDF conversion failed: ${convertError.message}` };
    }

    if (images.length === 0) {
      return { added: false, reason: 'PDF conversion produced no images' };
    }

    // Parse total
    let total: number | null = null;
    const rawTotal = invoice.total || invoice.invoice_total;
    if (typeof rawTotal === 'number') {
      total = rawTotal;
    } else if (typeof rawTotal === 'string') {
      const cleaned = rawTotal.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) {
        total = parsed;
      }
    }

    // Prepare parsed data
    const parsedData = {
      invoice_number: invoiceNumber,
      invoice_date: invoice.invoice_date || null,
      due_date: invoice.due_date || null,
      vendor_name: vendorName,
      total: total,
      office_location: invoice.office_location || invoice.office || null,
      line_items: Array.isArray(invoice.line_items) ? invoice.line_items : []
    };

    // Add to history
    console.log(`[HISTORY-AUTO] Adding invoice ${invoiceNumber || 'unknown'} to ${vendorName} history`);
    addToHistory(vendorName, invoiceNumber, images, parsedData, false);

    return { added: true };

  } catch (error: any) {
    console.error('[HISTORY-AUTO] Error adding to history:', error.message);
    return { added: false, error: error.message };
  }
}

/**
 * Batch add existing confirmed invoices to history
 * Useful for initial population of history database
 */
export async function batchAddToHistory(
  invoices: InvoiceForHistory[],
  onProgress?: (current: number, total: number, result: { invoice_number: string | null; added: boolean }) => void
): Promise<{
  total: number;
  added: number;
  skipped: number;
  errors: number;
}> {
  const results = { total: invoices.length, added: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    const result = await maybeAddToHistory(invoice);
    
    if (result.added) {
      results.added++;
    } else if (result.error) {
      results.errors++;
    } else {
      results.skipped++;
    }

    if (onProgress) {
      onProgress(i + 1, invoices.length, {
        invoice_number: invoice.invoice_number || null,
        added: result.added
      });
    }

    // Small delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}
