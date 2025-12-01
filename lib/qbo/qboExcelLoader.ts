import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export interface VendorCategoryMapping {
  vendor: string;           // Normalized (lowercase, trimmed)
  class: string | null;
  accountFullName: string;
  originalVendor: string;
  confidence: number;
}

let cachedMappings: VendorCategoryMapping[] | null = null;

/**
 * Load vendor-to-category mappings from pcs_qbo_transactions.xlsx
 * Expected columns: Vendor, Class, Account Full Name
 */
export function loadVendorCategoriesFromExcel(): VendorCategoryMapping[] {
  if (cachedMappings) return cachedMappings;

  const excelPath = path.join(process.cwd(), 'pcs_qbo_transactions.xlsx');

  try {
    if (!fs.existsSync(excelPath)) {
      console.warn('[QBO][EXCEL_LOADER] Excel file not found:', excelPath);
      cachedMappings = [];
      return cachedMappings;
    }

    // Read file as buffer first
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      console.warn('[QBO][EXCEL_LOADER] No sheets found in Excel file');
      cachedMappings = [];
      return cachedMappings;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet) as Array<any>;

    console.log(`[QBO][EXCEL_LOADER] Loaded ${rows.length} rows from Excel`);

    // Build mapping from rows
    const mappings: VendorCategoryMapping[] = [];
    const vendorMap = new Map<string, VendorCategoryMapping[]>();

    for (const row of rows) {
      // Handle different column name variations
      const vendor = (row.Vendor || row.vendor || row['Vendor'] || '').toString().trim();
      const qboClass = (row['Class full name'] || row['Class'] || row.class || row['class_full_name'] || '').toString().trim();
      const accountFullName = (row['Account full name_1'] || row['Account Full Name'] || row['account_full_name'] || '').toString().trim();

      if (!vendor || !accountFullName) {
        continue; // Skip incomplete rows
      }

      const normalized = vendor.toLowerCase();
      const mapping: VendorCategoryMapping = {
        vendor: normalized,
        class: qboClass || null,
        accountFullName,
        originalVendor: vendor,
        confidence: 0.95,
      };

      mappings.push(mapping);

      // Track multiple entries per vendor
      if (!vendorMap.has(normalized)) {
        vendorMap.set(normalized, []);
      }
      vendorMap.get(normalized)!.push(mapping);
    }

    console.log(`[QBO][EXCEL_LOADER] Created ${mappings.length} vendor mappings from ${vendorMap.size} unique vendors`);
    cachedMappings = mappings;
    return cachedMappings;
  } catch (err) {
    console.error('[QBO][EXCEL_LOADER] Failed to load Excel file:', err);
    cachedMappings = [];
    return cachedMappings;
  }
}

/**
 * Clear the cache (useful for testing or reloading)
 */
export function clearCache(): void {
  cachedMappings = null;
}

/**
 * Get all mappings for a specific vendor (exact match)
 */
export function getVendorMappings(vendor: string): VendorCategoryMapping[] {
  const normalized = (vendor || '').toLowerCase().trim();
  return loadVendorCategoriesFromExcel().filter(m => m.vendor === normalized);
}

/**
 * Get all unique vendors in the mapping
 */
export function getAllVendors(): string[] {
  const mappings = loadVendorCategoriesFromExcel();
  const vendors = new Set(mappings.map(m => m.originalVendor));
  return Array.from(vendors).sort();
}

