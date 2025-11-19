import { getDatabase } from '../db/client';
import { getInvoiceAllocations } from '../invoices/coding-template-service';

/**
 * Build QuickBooks Bill line items for a multi-location invoice
 * 
 * If invoice has allocations, creates one line per allocation.
 * Otherwise, uses single-location behavior.
 */
export function buildMultiLocationBillLines(invoiceId: string): any[] {
  const db = getDatabase();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  // If not multi-location, return empty (caller handles single-location)
  if (!invoice.is_multi_location) {
    return [];
  }

  // Get allocations
  const allocations = getInvoiceAllocations(invoiceId);

  if (allocations.length === 0) {
    console.warn('[QBO][MULTI_LOCATION]', 'No allocations found for multi-location invoice', { invoiceId });
    return [];
  }

  // Build line items
  const lines: any[] = [];
  let totalAmount = 0;

  for (const allocation of allocations) {
    const amountUSD = allocation.amount_cents / 100;
    totalAmount += amountUSD;

    // Get clinic info for location mapping
    const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(allocation.clinic_id) as any;

    const line = {
      Description: `${invoice.description || 'Invoice'} - ${clinic?.name || allocation.clinic_id}`,
      Amount: amountUSD,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: allocation.gl_account_id || allocation.gl_account_name || '1'
        },
        // Optional: Add ClassRef or LocationRef if QBO supports it
        ...(clinic?.id ? { ClassRef: { value: clinic.id } } : {})
      }
    };

    lines.push(line);
  }

  // Verify total matches invoice amount
  const invoiceAmountUSD = (invoice.amount_cents || 0) / 100;
  if (Math.abs(totalAmount - invoiceAmountUSD) > 0.01) {
    console.warn('[QBO][MULTI_LOCATION]', 'Allocation total mismatch', {
      invoiceId,
      invoiceAmount: invoiceAmountUSD,
      allocationTotal: totalAmount
    });
  }

  return lines;
}

/**
 * Validate that allocations sum to invoice total
 */
export function validateAllocations(invoiceId: string): { valid: boolean; error?: string } {
  const db = getDatabase();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

  if (!invoice) {
    return { valid: false, error: 'Invoice not found' };
  }

  if (!invoice.is_multi_location) {
    return { valid: true };
  }

  const allocations = getInvoiceAllocations(invoiceId);
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
  const invoiceTotal = invoice.amount_cents || 0;

  if (totalAllocated !== invoiceTotal) {
    return {
      valid: false,
      error: `Allocation total (${totalAllocated}) does not match invoice total (${invoiceTotal})`
    };
  }

  return { valid: true };
}

/**
 * Get allocation summary for display
 */
export function getAllocationSummary(invoiceId: string) {
  const db = getDatabase();
  const allocations = getInvoiceAllocations(invoiceId);

  return allocations.map(allocation => {
    const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(allocation.clinic_id) as any;
    return {
      clinic_id: allocation.clinic_id,
      clinic_name: clinic?.name || 'Unknown',
      amount_cents: allocation.amount_cents,
      amount_usd: allocation.amount_cents / 100,
      gl_account_name: allocation.gl_account_name
    };
  });
}

