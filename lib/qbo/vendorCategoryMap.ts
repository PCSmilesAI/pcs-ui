import { loadVendorCategoriesFromExcel, VendorCategoryMapping } from './qboExcelLoader';

export interface VendorCategoryEntry {
  vendor: string;
  class: string | null;
  accountFullName: string;
  count?: number;
  rank?: number;
}

export interface VendorCategoryCandidate {
  vendor: string;
  class: string | null;
  accountFullName: string;
  confidence: number;
  source: 'exact_match' | 'fuzzy_match' | 'hardcoded';
}

/**
 * Hardcoded vendor-to-class mappings for vendors with 100% consistent class assignments
 * These vendors always use the same class across all transactions
 */
const HARDCODED_VENDOR_CLASSES: Record<string, string> = {
  'sharp smiles llc': 'General-Roseburg',
  'xuanlan pham': 'General-Riddle',
  'kt commercial llc': 'General-Salem',
  'distinct office structures llc': 'General-Salem',
  'lucille mozena': '',
  'dr reza safari': '',
  'dr reid donakey': '',
  'darko marusnik': '',
  'lapriel gilpatrick': '',
  'patricia schaak-': '',
};

/**
 * Get vendor category candidates with exact and fuzzy matching
 * Returns candidates sorted by confidence score
 * Prioritizes hardcoded vendor classes for vendors with 100% consistent assignments
 */
export function getVendorCategoryCandidates(vendorName: string): VendorCategoryCandidate[] {
  if (!vendorName) return [];

  const normalized = vendorName.trim().toLowerCase();

  // Check hardcoded vendor classes first (highest confidence)
  if (HARDCODED_VENDOR_CLASSES[normalized] !== undefined) {
    const hardcodedClass = HARDCODED_VENDOR_CLASSES[normalized];
    const mappings = loadVendorCategoriesFromExcel();

    // Find the account mapping for this vendor to get the account full name
    const vendorMappings = mappings.filter(m => m.vendor === normalized);
    if (vendorMappings.length > 0) {
      const mapping = vendorMappings[0];
      return [{
        vendor: normalized,
        class: hardcodedClass || null,
        accountFullName: mapping.accountFullName,
        confidence: 1.0, // 100% confidence for hardcoded classes
        source: 'hardcoded' as const,
      }];
    }
  }

  const mappings = loadVendorCategoriesFromExcel();

  // Exact match
  const exactMatches = mappings.filter(m => m.vendor === normalized);
  if (exactMatches.length > 0) {
    return exactMatches.map(m => ({
      vendor: m.vendor,
      class: m.class,
      accountFullName: m.accountFullName,
      confidence: 0.95,
      source: 'exact_match' as const,
    }));
  }

  // Fuzzy match (contains or partial match)
  const fuzzyMatches = mappings.filter(m =>
    normalized.includes(m.vendor) || m.vendor.includes(normalized)
  );
  if (fuzzyMatches.length > 0) {
    return fuzzyMatches.map(m => ({
      vendor: m.vendor,
      class: m.class,
      accountFullName: m.accountFullName,
      confidence: 0.80,
      source: 'fuzzy_match' as const,
    }));
  }

  return [];
}
