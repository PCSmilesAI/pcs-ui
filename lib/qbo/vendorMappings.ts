import fs from 'fs';
import path from 'path';

export type VendorMappingEntry = {
  defaultAccount: string | null;
  defaultClass: string | null;
  accounts: Array<{ name: string; count: number; ratio: number }>;
  classes: Array<{ name: string; count: number; ratio: number }>;
  sampleInvoiceIds?: string[];
  sampleCount?: number;
};

export type VendorMappings = Record<string, VendorMappingEntry>;

let cachedMappings: VendorMappings | null = null;
let cachedMtimeMs: number | null = null;

function getMappingsPath(): string {
  return path.resolve(process.cwd(), 'pcs_ai_data', 'qbo_vendor_mappings.json');
}

export function loadVendorMappings(force = false): VendorMappings {
  try {
    const filePath = getMappingsPath();
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const mtimeMs = stat ? stat.mtimeMs : null;

    if (!force && cachedMappings && cachedMtimeMs && mtimeMs === cachedMtimeMs) {
      return cachedMappings;
    }

    if (!fs.existsSync(filePath)) {
      cachedMappings = {};
      cachedMtimeMs = null;
      return cachedMappings;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as VendorMappings;
    cachedMappings = parsed || {};
    cachedMtimeMs = mtimeMs;
    return cachedMappings;
  } catch (_) {
    return cachedMappings || {};
  }
}

export function getVendorMapping(vendorName: string): VendorMappingEntry | null {
  if (!vendorName) return null;
  const mappings = loadVendorMappings();
  if (!mappings || Object.keys(mappings).length === 0) return null;

  // Exact match
  if (mappings[vendorName]) return mappings[vendorName];

  // Case-insensitive exact
  const exactInsensitive = Object.keys(mappings).find((k) => k.toLowerCase() === vendorName.toLowerCase());
  if (exactInsensitive) return mappings[exactInsensitive];

  // Partial match
  const partial = Object.keys(mappings).find((k) =>
    k.toLowerCase().includes(vendorName.toLowerCase()) || vendorName.toLowerCase().includes(k.toLowerCase())
  );
  return partial ? mappings[partial] : null;
}


