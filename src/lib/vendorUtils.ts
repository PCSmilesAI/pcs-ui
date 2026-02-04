/**
 * Vendor name normalization utilities
 * 
 * This ensures vendor names are consistent across the application,
 * preventing duplicates like "Exodus Dental Solutions" vs "exodus_dental_solutions"
 */

/**
 * Normalize a vendor name to a canonical format
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces underscores with spaces
 * - Removes extra spaces
 * - Maps known vendor aliases to canonical names
 */
export function normalizeVendorName(name: string | null | undefined): string {
  if (!name) return 'unknown';
  
  let normalized = name
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
  
  // Map vendor aliases to canonical names
  // TC Dental Lab variations
  const tcDentalVariations = [
    'tc dental',
    'tcdental',
    'tc dental labs',
    'tc dental laboratory',
    't.c. dental',
    't.c. dental lab',
  ];
  
  if (tcDentalVariations.includes(normalized) || normalized.startsWith('tc dental')) {
    return 'tc dental lab';
  }
  
  return normalized;
}

/**
 * Get a display-friendly vendor name
 * - Capitalizes first letter of each word
 * - Preserves special cases like "ACH", "LLC", etc.
 */
export function getDisplayVendorName(name: string | null | undefined): string {
  if (!name) return 'Unknown';
  
  const normalized = normalizeVendorName(name);
  
  // Special cases for known vendors
  const specialCases: Record<string, string> = {
    'henry schein': 'Henry Schein',
    'patterson dental': 'Patterson Dental',
    'exodus dental solutions': 'Exodus Dental Solutions',
    'epic dental lab': 'Epic Dental Lab',
    'tc dental lab': 'TC Dental Lab',
    'ic dental': 'IC Dental',
    'dandy': 'Dandy',
  };
  
  if (specialCases[normalized]) {
    return specialCases[normalized];
  }
  
  // Title case for other vendors
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if two vendor names match (case-insensitive, ignoring underscores)
 */
export function vendorNamesMatch(name1: string | null | undefined, name2: string | null | undefined): boolean {
  return normalizeVendorName(name1) === normalizeVendorName(name2);
}

/**
 * Extract vendor name from an invoice object
 * Tries vendor_name first, then vendor, then returns 'Unknown'
 */
export function getVendorNameFromInvoice(invoice: any): string {
  const rawName = invoice?.vendor_name || invoice?.vendor;
  return getDisplayVendorName(rawName);
}

/**
 * Get normalized vendor name from an invoice (for grouping/filtering)
 */
export function getNormalizedVendorFromInvoice(invoice: any): string {
  const rawName = invoice?.vendor_name || invoice?.vendor;
  return normalizeVendorName(rawName);
}

/**
 * Parse invoice amount from multiple possible fields
 * Handles the fact that amount_cents is in cents, while invoice_total/total are in dollars
 * @returns amount in dollars as a number
 */
export function parseInvoiceAmount(invoice: any): number {
  // Priority 1: amount_cents (stored in cents, need to divide by 100)
  if (invoice?.amount_cents != null && invoice.amount_cents !== 0) {
    const cents = typeof invoice.amount_cents === 'number'
      ? invoice.amount_cents
      : parseFloat(String(invoice.amount_cents).replace(/[^0-9.-]/g, '')) || 0;
    return cents / 100;
  }
  
  // Priority 2: invoice_total (already in dollars)
  if (invoice?.invoice_total != null && invoice.invoice_total !== 0) {
    return typeof invoice.invoice_total === 'number'
      ? invoice.invoice_total
      : parseFloat(String(invoice.invoice_total).replace(/[^0-9.-]/g, '')) || 0;
  }
  
  // Priority 3: total (already in dollars)
  if (invoice?.total != null && invoice.total !== 0) {
    return typeof invoice.total === 'number'
      ? invoice.total
      : parseFloat(String(invoice.total).replace(/[^0-9.-]/g, '')) || 0;
  }
  
  // Priority 4: amount field (could be string like "$123.45" or number)
  if (invoice?.amount != null) {
    const amountStr = String(invoice.amount).replace(/[^0-9.-]/g, '');
    return parseFloat(amountStr) || 0;
  }
  
  return 0;
}

/**
 * Format an amount as a dollar string
 * @param amount amount in dollars
 * @returns formatted string like "$123.45"
 */
export function formatDollarAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}