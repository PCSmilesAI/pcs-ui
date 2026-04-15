import { qboClient } from './qboClient';
import { PCS_CLASSES } from './pcsClasses';

interface AccountLookupResult {
  id: string;
  name: string;
  fullName: string;
  type: string;
  subType?: string;
}

interface ClassLookupResult {
  id: string;
  name: string;
  fullName: string;
}

interface LocationLookupResult {
  id: string;
  name: string;
  fullName: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

const DISALLOWED_ACCOUNT_TYPES = new Set([
  'Accounts Payable',
  'Accounts Receivable',
  'Bank',
  'Credit Card',
  'Equity',
  'Other Current Liability',
  'Long Term Liability',
]);

const ALLOWED_ACCOUNT_TYPES = new Set([
  'Expense',
  'Cost of Goods Sold',
  'Other Expense',
  'Other Current Asset',
  'Other Asset',
  'Fixed Asset',
  'Current Asset',
  'Inventory Asset',
]);

let accountCache: {
  expiresAt: number;
  map: Map<string, AccountLookupResult>;
} | null = null;

let classCache: {
  expiresAt: number;
  map: Map<string, ClassLookupResult>;
} | null = null;

let locationCache: {
  expiresAt: number;
  map: Map<string, LocationLookupResult>;
} | null = null;

function normalizeKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function ensureAccountCache(): Promise<typeof accountCache> {
  if (accountCache && Date.now() < accountCache.expiresAt) {
    return accountCache;
  }

  await qboClient.initialize();
  const accounts = await qboClient.getAllAccounts();

  const map = new Map<string, AccountLookupResult>();
  for (const account of accounts) {
    const entry: AccountLookupResult = {
      id: account.id,
      name: account.name,
      fullName: account.fullName || account.name,
      type: account.type,
      subType: account.subType,
    };

    const keys = new Set<string>();
    keys.add(normalizeKey(entry.fullName));
    keys.add(normalizeKey(entry.name));

    if (account.acctNum) {
      keys.add(normalizeKey(`${account.acctNum} ${entry.name}`));
      keys.add(normalizeKey(`${account.acctNum}`));
    }

    for (const key of keys) {
      map.set(key, entry);
    }
  }

  accountCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    map,
  };

  return accountCache;
}

async function ensureClassCache(): Promise<typeof classCache> {
  if (classCache && Date.now() < classCache.expiresAt) {
    return classCache;
  }

  let classes: Array<{ id: string; name: string; fullName: string }> = [];
  
  try {
    await qboClient.initialize();
    classes = await qboClient.getClasses();
  } catch (error) {
    console.warn('[QBO][LOOKUP] Failed to fetch classes from QBO, using hardcoded:', error);
  }

  // Fallback to hardcoded PCS classes if QBO returns empty
  if (classes.length === 0) {
    console.log('[QBO][LOOKUP] Using hardcoded PCS classes');
    classes = [...PCS_CLASSES];
  }

  const map = new Map<string, ClassLookupResult>();
  for (const item of classes) {
    const entry: ClassLookupResult = {
      id: item.id,
      name: item.name,
      fullName: item.fullName || item.name,
    };

    const keys = new Set<string>();
    keys.add(normalizeKey(entry.fullName));
    keys.add(normalizeKey(entry.name));

    for (const key of keys) {
      map.set(key, entry);
    }
  }

  classCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    map,
  };

  return classCache;
}

async function ensureLocationCache(): Promise<typeof locationCache> {
  if (locationCache && Date.now() < locationCache.expiresAt) {
    return locationCache;
  }

  let locations: Array<{ id: string; name: string; fullName: string }> = [];
  
  try {
    await qboClient.initialize();
    locations = await qboClient.getLocations();
  } catch (error) {
    console.warn('[QBO][LOOKUP] Failed to fetch locations from QBO, using hardcoded:', error);
  }

  // Fallback to hardcoded PCS classes as locations if QBO returns empty
  if (locations.length === 0) {
    console.log('[QBO][LOOKUP] Using hardcoded PCS classes as locations');
    locations = [...PCS_CLASSES];
  }

  const map = new Map<string, LocationLookupResult>();
  for (const item of locations) {
    const entry: LocationLookupResult = {
      id: item.id,
      name: item.name,
      fullName: item.fullName || item.name,
    };

    const keys = new Set<string>();
    keys.add(normalizeKey(entry.fullName));
    keys.add(normalizeKey(entry.name));

    for (const key of keys) {
      map.set(key, entry);
    }
  }

  locationCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    map,
  };

  return locationCache;
}

function validateAccountType(match: AccountLookupResult, accountPath: string): AccountLookupResult | undefined {
  if (DISALLOWED_ACCOUNT_TYPES.has(match.type)) {
    console.warn('[QBO][LOOKUP] Account type not allowed on bill line:', {
      accountPath,
      accountType: match.type,
    });
    return undefined;
  }

  if (!ALLOWED_ACCOUNT_TYPES.has(match.type)) {
    console.warn('[QBO][LOOKUP] Account type not explicitly allowed, skipping:', {
      accountPath,
      accountType: match.type,
    });
    return undefined;
  }

  return match;
}

export async function resolveAccountByFullName(
  accountPath?: string
): Promise<AccountLookupResult | undefined> {
  if (!accountPath || !accountPath.trim()) {
    return undefined;
  }

  const cache = await ensureAccountCache();
  const normalized = normalizeKey(accountPath);
  let match = cache?.map.get(normalized);

  if (!match) {
    const leaf = accountPath.includes(':')
      ? accountPath.split(':').pop()!.trim()
      : accountPath.trim();
    if (leaf && leaf !== accountPath.trim()) {
      match = cache?.map.get(normalizeKey(leaf));
    }
  }

  if (!match) {
    const stripped = accountPath.trim().replace(/^\d+\s+/, '');
    if (stripped && stripped !== accountPath.trim()) {
      match = cache?.map.get(normalizeKey(stripped));
    }
  }

  if (!match) {
    const numMatch = accountPath.trim().match(/^(\d+)/);
    if (numMatch) {
      match = cache?.map.get(normalizeKey(numMatch[1]));
    }
  }

  if (!match) {
    const target = normalized;
    for (const [key, entry] of cache?.map.entries() || []) {
      if (key.includes(target) || target.includes(key)) {
        if (key.length > 2 && target.length > 2) {
          match = entry;
          break;
        }
      }
    }
  }

  if (!match) {
    console.log('[QBO][LOOKUP] Account not in cache, using fallback:', accountPath);
    return undefined;
  }

  return validateAccountType(match, accountPath);
}

export async function resolveClassByFullName(
  classPath?: string
): Promise<ClassLookupResult | undefined> {
  if (!classPath || !classPath.trim()) {
    return undefined;
  }

  const cache = await ensureClassCache();
  const normalized = normalizeKey(classPath);
  const match = cache?.map.get(normalized);

  if (!match) {
    console.warn('[QBO][LOOKUP] Class not found for path:', classPath);
    return undefined;
  }

  return match;
}

export async function resolveLocationByName(
  locationName?: string
): Promise<LocationLookupResult | undefined> {
  if (!locationName || !locationName.trim()) {
    return undefined;
  }

  const cache = await ensureLocationCache();
  const normalized = normalizeKey(locationName);
  let match = cache?.map.get(normalized);

  if (!match) {
    const variants = [
      `general-${locationName}`,
      `general ${locationName}`,
      `general-${locationName}`.replace(/\s+/g, ''),
      `general ${locationName}`.replace(/\s+/g, ' '),
    ];
    for (const variant of variants) {
      const candidate = cache?.map.get(normalizeKey(variant));
      if (candidate) {
        match = candidate;
        break;
      }
    }
  }

  if (!match) {
    const fallback = Array.from(cache?.map.values() || []).find((entry) =>
      entry.fullName.toLowerCase().includes(normalized) || normalized.includes(entry.fullName.toLowerCase())
    );
    if (fallback) {
      match = fallback;
    }
  }

  if (!match) {
    console.warn('[QBO][LOOKUP] Location not found for name:', locationName);
    return undefined;
  }

  return match;
}

export function clearLookupCaches(): void {
  accountCache = null;
  classCache = null;
  locationCache = null;
}
