/**
 * Vendor name normalization for backend
 * 
 * This ensures vendor names are consistently normalized when stored in the database,
 * preventing duplicates like "Exodus Dental Solutions" vs "exodus_dental_solutions"
 */

/**
 * Normalize a vendor name to a canonical format for storage
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces underscores with spaces
 * - Removes extra spaces
 * - Maps to canonical vendor names
 */
export function normalizeVendorNameForStorage(name: string | null | undefined): string {
  if (!name) return 'unknown';
  
  let normalized = name
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
  
  // Map to canonical vendor names
  const canonicalMap: Record<string, string> = {
    'henry schein': 'Henry Schein',
    'patterson dental': 'Patterson Dental',
    'exodus dental solutions': 'Exodus Dental Solutions',
    'epic dental lab': 'Epic Dental Lab',
    'tc dental lab': 'TC Dental Lab',
    'ic dental': 'IC Dental',
    'dandy': 'Dandy',
    'artisan dental': 'Artisan Dental',
    'miracle cleaners': 'Miracle Cleaners',
    'professional office services': 'Professional Office Services',
    'ondeim': 'Ondeim',
  };
  
  // Check if normalized name matches a canonical vendor
  if (canonicalMap[normalized]) {
    return canonicalMap[normalized];
  }
  
  // Handle vendor name prefix patterns (e.g. "TC Dental Laboratory, Inc." → "TC Dental Lab")
  if (normalized.startsWith('tc dental')) {
    return 'TC Dental Lab';
  }
  
  // For unknown vendors, apply title case
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get display-friendly vendor name (same as normalizeVendorNameForStorage for consistency)
 */
export function getDisplayVendorNameForBackend(name: string | null | undefined): string {
  return normalizeVendorNameForStorage(name);
}

/**
 * Infer vendor from email watcher hints when GPT returns Unknown.
 * Common for TC Dental multi-invoice PDF batches from Laura's scanner emails.
 */
export function inferVendorFromHints(
  parsedVendor: string | null | undefined,
  options?: { vendorHint?: string; pdfFilename?: string }
): string {
  const current = (parsedVendor || '').trim();
  if (current && current.toLowerCase() !== 'unknown') {
    return current;
  }

  const hint = (options?.vendorHint || '').toLowerCase();
  const filename = (options?.pdfFilename || '').toLowerCase();
  const blob = `${hint} ${filename}`;

  if (
    hint === 'tc' ||
    blob.includes('tc dental') ||
    blob.includes('tcdental') ||
    filename.includes('tc_dental') ||
    filename.startsWith('tc_') ||
    filename.includes('_tc_')
  ) {
    return 'TC Dental Lab';
  }

  return current || 'Unknown';
}

