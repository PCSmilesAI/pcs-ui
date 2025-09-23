import { qboClient } from './qboClient';

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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
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

  await qboClient.initialize();
  const classes = await qboClient.getClasses();

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

export async function resolveAccountByFullName(
  accountPath?: string
): Promise<AccountLookupResult | undefined> {
  if (!accountPath || !accountPath.trim()) {
    return undefined;
  }

  const cache = await ensureAccountCache();
  const normalized = normalizeKey(accountPath);
  const match = cache?.map.get(normalized);

  if (!match) {
    console.warn('[QBO][LOOKUP] Account not found for path:', accountPath);
    return undefined;
  }

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

export function clearLookupCaches(): void {
  accountCache = null;
  classCache = null;
}
