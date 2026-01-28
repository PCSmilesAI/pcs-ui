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
 * Hardcoded vendor-to-account mappings for vendors with 100% consistent account categories
 * These vendors always use the same account across all transactions
 */
const HARDCODED_VENDOR_ACCOUNTS: Record<string, string> = {
  // Original mappings
  'american express': '10010 Checking - CTR Services Northwest',
  'stampli': '53334 Software',
  'bio-tek medical': '52120 Medical Gases',
  'avista': '53323 Natural Gas',
  'syed umer': '10010 Checking - CTR Services Northwest',
  'dr dennis perala': '10010 Checking - CTR Services Northwest',
  'julieanne stone': '10010 Checking - CTR Services Northwest',
  'laura georlett-': '10010 Checking - CTR Services Northwest',
  "builder's electric, inc": '11040 Leasehold Improvements',
  'south umpaqua disposal': '53225 Hazardous Disposal',
  'culligan': '53220 Office Expenses',
  'dexis': '53334 Software',
  'cintas': '53361 Contract Services',
  'crest+oral-b': '10210 Dental Supplies Inventory',
  'dr reza safari': '51180 Doctor-Contract Labor',
  'dr reid donakey': '51140 Doctor-Training & Continuing Education',
  'darko marusnik': '10010 Checking - CTR Services Northwest',
  'lapriel gilpatrick': '10010 Checking - CTR Services Northwest',
  
  // Additional vendors (previously uncategorized)
  'ultradent products inc': '10210 Dental Supplies Inventory',
  'ultradent': '10210 Dental Supplies Inventory',
  'linde gas & equipment inc': '52120 Medical Gases',
  'linde gas': '52120 Medical Gases',
  'heaths laundry': '53224 Uniforms & Cleaning',
  'method procurement technologies llc': '53334 Software',
  'method procurement': '53334 Software',
  'fyle inc': '53334 Software',
  'fyle': '53334 Software',
  'megagen america': '11010 Dental Equipment',
  'megagen': '11010 Dental Equipment',
  'comcast business': '53331 Internet',
  'comcast': '53331 Internet',
  'trustworkz inc': '53334 Software',
  'trustworkz': '53334 Software',
  'trilogy medwaste west llc': '53225 Hazardous Disposal',
  'trilogy medwaste': '53225 Hazardous Disposal',
  'brassler usa': '10210 Dental Supplies Inventory',
  'brassler': '10210 Dental Supplies Inventory',
  'airgas usa llc': '52120 Medical Gases',
  'airgas': '52120 Medical Gases',
  'adt': '53361 Contract Services',
  'adt security': '53361 Contract Services',
  
  // Patterson Dental - use most common account
  'patterson dental': '10210 Dental Supplies Inventory',
  'patterson': '10210 Dental Supplies Inventory',
  
  // Additional vendors from uncategorized list
  'ondiem': '53361 Contract Services',
  'south umpqua disposal': '53225 Hazardous Disposal',
  'benco': '10210 Dental Supplies Inventory',
  'benco dental': '10210 Dental Supplies Inventory',
  'national interpreting service inc': '53361 Contract Services',
  'national interpreting service': '53361 Contract Services',
  'safeway': '53220 Office Expenses',
  'statdds': '53334 Software',
  'oral biotech': '10210 Dental Supplies Inventory',
  'oral biotech, llc': '10210 Dental Supplies Inventory',
  'procter & gamble': '10210 Dental Supplies Inventory',
  'umpqua valley fire services': '53361 Contract Services',
  'umpqua valley fire services, inc': '53361 Contract Services',
  'marion environmental services': '53225 Hazardous Disposal',
  'marion environmental services, inc.': '53225 Hazardous Disposal',
  'bonadent': '52210 Dental Lab Fees',
  'pacific dental services': '53361 Contract Services',
  'corsearch': '53334 Software',
  'berman fink van horn p.c.': '53360 Professional Fees',
  'berman fink van horn': '53360 Professional Fees',
  'henry schein inc': '10210 Dental Supplies Inventory',
  'tc dental': '10210 Dental Supplies Inventory',
  'tc dental laboratory': '52210 Dental Lab Fees',
  'glidewell': '52210 Dental Lab Fees',
  'glidewell dental': '52210 Dental Lab Fees',
  
  // More vendors
  'tech edge': '53334 Software',
  'systech consulting': '53334 Software',
  'premier dental products': '10210 Dental Supplies Inventory',
  'premier dental products co.': '10210 Dental Supplies Inventory',
  'pacific supply': '10210 Dental Supplies Inventory',
  'pacific crest supplies': '10210 Dental Supplies Inventory',
  'instruments direct supply': '11010 Dental Equipment',
  'instruments direct supply, inc.': '11010 Dental Equipment',
  'dental town': '10210 Dental Supplies Inventory',
  'jan-pro': '53221 Janitorial',
  'jan pro': '53221 Janitorial',
  'passport to languages inc': '53361 Contract Services',
  'passport to languages': '53361 Contract Services',
  'national fire fighter corp.': '53361 Contract Services',
  'national fire fighter': '53361 Contract Services',
  'adco g & s equipment': '11010 Dental Equipment',
  'sunset heating': '53361 Contract Services',
  'sunset heating, cooling, & electrical': '53361 Contract Services',
  'housfield dental': '10210 Dental Supplies Inventory',
  'odp business solutions': '53223 Office Supplies',
  'national interpretation service': '53361 Contract Services',
  'pure clean llc': '53221 Janitorial',
  'pure clean': '53221 Janitorial',
  "murphy's law janitorial": '53221 Janitorial',
  'murphys law janitorial': '53221 Janitorial',
};

/**
 * Get vendor category candidates with exact and fuzzy matching
 * Returns candidates sorted by confidence score
 * Prioritizes hardcoded vendor classes/accounts for vendors with 100% consistent assignments
 */
export function getVendorCategoryCandidates(vendorName: string): VendorCategoryCandidate[] {
  if (!vendorName) return [];

  const normalized = vendorName.trim().toLowerCase();

  // Check if vendor has any hardcoded values (class or account)
  const hasHardcodedClass = HARDCODED_VENDOR_CLASSES[normalized] !== undefined;
  const hasHardcodedAccount = HARDCODED_VENDOR_ACCOUNTS[normalized] !== undefined;

  if (hasHardcodedClass || hasHardcodedAccount) {
    const hardcodedClass = hasHardcodedClass ? HARDCODED_VENDOR_CLASSES[normalized] : null;
    const hardcodedAccount = hasHardcodedAccount ? HARDCODED_VENDOR_ACCOUNTS[normalized] : null;

    // If we have a hardcoded account, use it directly
    if (hardcodedAccount) {
      return [{
        vendor: normalized,
        class: hardcodedClass || null,
        accountFullName: hardcodedAccount,
        confidence: 1.0, // 100% confidence for hardcoded values
        source: 'hardcoded' as const,
      }];
    }

    // If only hardcoded class, get account from Excel
    const mappings = loadVendorCategoriesFromExcel();
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
