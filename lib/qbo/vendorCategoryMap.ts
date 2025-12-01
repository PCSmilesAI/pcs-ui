import fs from 'fs';
import path from 'path';

export interface VendorCategoryEntry {
  vendor: string;
  class: string | null;
  accountFullName: string;
  count: number;
  rank: number;
}

let cached: VendorCategoryEntry[] | null = null;

function loadMapping(): VendorCategoryEntry[] {
  if (cached) return cached;
  const mappingPath = path.join(process.cwd(), 'config', 'qbo_vendor_categories.json');
  if (!fs.existsSync(mappingPath)) {
    console.warn('[QBO][VENDOR_MAP] Mapping file missing at', mappingPath);
    cached = [];
    return cached;
  }
  try {
    const raw = fs.readFileSync(mappingPath, 'utf-8');
    const data = JSON.parse(raw) as VendorCategoryEntry[];
    cached = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[QBO][VENDOR_MAP] Failed to read mapping file', err);
    cached = [];
  }
  return cached!;
}

export function getVendorCategoryCandidates(vendorName: string): VendorCategoryEntry[] {
  if (!vendorName) return [];
  const vendorKey = vendorName.trim().toLowerCase();
  return loadMapping().filter((entry) => entry.vendor === vendorKey).sort((a, b) => a.rank - b.rank);
}
