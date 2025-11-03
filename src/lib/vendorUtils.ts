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
 */
export function normalizeVendorName(name: string | null | undefined): string {
  if (!name) return 'unknown';
  
  return name
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
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

