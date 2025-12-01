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
  source: 'exact_match' | 'fuzzy_match';
}

/**
 * Get vendor category candidates with exact and fuzzy matching
 * Returns candidates sorted by confidence score
 */
export function getVendorCategoryCandidates(vendorName: string): VendorCategoryCandidate[] {
  if (!vendorName) return [];

  const normalized = vendorName.trim().toLowerCase();
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
