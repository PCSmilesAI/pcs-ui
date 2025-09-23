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

type VendorHistoryEntry = {
  Classes?: string[];
  Categories?: string[];
};

type VendorHistoryMap = Record<string, VendorHistoryEntry>;

type CachedHistory = {
  mtimeMs: number | null;
  map: VendorHistoryMap;
};

let cachedMappings: VendorMappings | null = null;
let cachedMtimeMs: number | null = null;

let cachedHistory: CachedHistory | null = null;
let historyLoadPromise: Promise<VendorHistoryMap> | null = null;

function getMappingsPath(): string {
  return path.resolve(process.cwd(), 'pcs_ai_data', 'qbo_vendor_mappings.json');
}

function getHistoryPath(): string {
  const preferred = path.resolve(process.cwd(), 'pcs_ai_data', 'vendor_class_category_map.json');
  if (fs.existsSync(preferred)) {
    return preferred;
  }
  return path.resolve(process.cwd(), 'vendor_class_category_map.json');
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

function normalizeVendorName(name: string): string {
  return name.trim().toLowerCase();
}

async function loadVendorHistory(force = false): Promise<VendorHistoryMap> {
  const filePath = getHistoryPath();

  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const mtimeMs = stat ? stat.mtimeMs : null;

    if (!force && cachedHistory && cachedHistory.mtimeMs === mtimeMs) {
      return cachedHistory.map;
    }

    if (!fs.existsSync(filePath)) {
      cachedHistory = { map: {}, mtimeMs: null };
      return cachedHistory.map;
    }

    if (!force && historyLoadPromise) {
      return historyLoadPromise;
    }

    const readPromise = fs.promises
      .readFile(filePath, 'utf8')
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw) as VendorHistoryMap;
          cachedHistory = {
            map: parsed || {},
            mtimeMs,
          };
        } catch (error) {
          console.warn('[QBO] Failed to parse vendor_class_category_map.json:', error);
          cachedHistory = { map: {}, mtimeMs };
        }
        return cachedHistory.map;
      })
      .finally(() => {
        historyLoadPromise = null;
      });

    historyLoadPromise = readPromise;
    return readPromise;
  } catch (error) {
    console.warn('[QBO] Error loading vendor history map:', error);
    cachedHistory = cachedHistory || { map: {}, mtimeMs: null };
    return cachedHistory.map;
  }
}

export async function pickMappingForVendor(
  vendorName: string
): Promise<{ classPath?: string; accountPath?: string; matchedVendor?: string }> {
  if (!vendorName) return {};

  const history = await loadVendorHistory();
  if (!history || Object.keys(history).length === 0) {
    return {};
  }

  const normalized = normalizeVendorName(vendorName);

  let matchedKey: string | undefined;

  if (history[vendorName]) {
    matchedKey = vendorName;
  } else {
    matchedKey = Object.keys(history).find((key) => normalizeVendorName(key) === normalized);
  }

  if (!matchedKey) {
    matchedKey = Object.keys(history).find((key) =>
      normalizeVendorName(key).includes(normalized) || normalized.includes(normalizeVendorName(key))
    );
  }

  if (!matchedKey) {
    return {};
  }

  const entry = history[matchedKey] || {};
  const firstClass = entry.Classes?.[0]?.trim();
  const firstCategory = entry.Categories?.[0]?.trim();

  return {
    classPath: firstClass || undefined,
    accountPath: firstCategory || undefined,
    matchedVendor: matchedKey,
  };
}


