/**
 * lib/receipts/plaid-sync.ts
 *
 * Plaid integration for the Amex feed:
 *   - Link flow helpers (create link token, exchange public token) used by the
 *     Integrations page to connect an institution from the UI.
 *   - syncAmexFromPlaid(): pull charges for every connected item into
 *     amex_transactions, in the same shape statement-import produces (so
 *     reconcile + dedupe just work).
 *
 * Uses the Plaid REST API directly via fetch — no SDK dependency. Connecting
 * requires PLAID_CLIENT_ID + PLAID_SECRET (+ PLAID_ENV). Access tokens are
 * obtained via Link and stored in plaid_items (not env), though a legacy
 * PLAID_ACCESS_TOKEN env var is still honored if present.
 *
 * NOTE: untested against a live Plaid item (no credentials in this environment).
 */

import { bulkInsert, type AmexTransaction } from './transactions-store';
import { getAccessTokens, saveItem, markSynced } from './plaid-store';

export function hasPlaidCredentials(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

/** True when the Link flow can be started (client credentials present). */
export function isPlaidConfigured(): boolean {
  return hasPlaidCredentials();
}

function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  if (env === 'production') return 'https://production.plaid.com';
  if (env === 'development') return 'https://development.plaid.com';
  return 'https://sandbox.plaid.com';
}

async function plaidRequest(path: string, body: Record<string, unknown>): Promise<any> {
  if (!hasPlaidCredentials()) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET (and PLAID_ENV).');
  }
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error_message || `Plaid ${path} failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return json;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── Link flow ─────────────────────────────────────────────────────────────

export async function createLinkToken(userId: string): Promise<string> {
  const json = await plaidRequest('/link/token/create', {
    user: { client_user_id: userId || 'pcs-receipts-user' },
    client_name: 'PCS Receipts',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
  return json.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
  opts: { institutionName?: string; connectedBy?: string } = {}
): Promise<{ item_id: string; institution_name: string }> {
  const exchanged = await plaidRequest('/item/public_token/exchange', { public_token: publicToken });
  const access_token = exchanged.access_token as string;
  const item_id = exchanged.item_id as string;
  saveItem({
    item_id,
    access_token,
    institution_name: opts.institutionName || '',
    connected_by: opts.connectedBy || '',
  });
  return { item_id, institution_name: opts.institutionName || '' };
}

// ─── Sync ──────────────────────────────────────────────────────────────────

interface PlaidTxn {
  date: string;
  amount: number;
  name?: string;
  merchant_name?: string;
  account_id?: string;
  transaction_id?: string;
  category?: string[];
  personal_finance_category?: { primary?: string };
}
interface PlaidAccount {
  account_id: string;
  mask?: string;
  name?: string;
}

function allTokens(): string[] {
  const stored = getAccessTokens();
  const env = process.env.PLAID_ACCESS_TOKEN;
  return env ? Array.from(new Set([...stored, env])) : stored;
}

async function fetchTokenTransactions(accessToken: string, start_date: string, end_date: string): Promise<PlaidTxn[]> {
  const all: PlaidTxn[] = [];
  const accountsById = new Map<string, PlaidAccount>();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const json = await plaidRequest('/transactions/get', {
      access_token: accessToken,
      start_date,
      end_date,
      options: { count: 500, offset },
    });
    total = json.total_transactions ?? (json.transactions || []).length;
    for (const a of (json.accounts || []) as PlaidAccount[]) accountsById.set(a.account_id, a);
    const batch: PlaidTxn[] = json.transactions || [];
    if (batch.length === 0) break;
    // Attach account mask/name to each txn for mapping.
    for (const t of batch) {
      const acct = t.account_id ? accountsById.get(t.account_id) : undefined;
      (t as any).__mask = acct?.mask;
      (t as any).__acctName = acct?.name;
    }
    all.push(...batch);
    offset += batch.length;
  }
  return all;
}

export async function syncAmexFromPlaid(opts: { startDate?: string; endDate?: string } = {}): Promise<{
  inserted: number;
  skipped: number;
  total: number;
}> {
  const tokens = allTokens();
  if (tokens.length === 0) {
    throw new Error('No Plaid item connected. Connect an institution on the Integrations page first.');
  }

  const start_date = opts.startDate || isoDaysAgo(90);
  const end_date = opts.endDate || new Date().toISOString().slice(0, 10);

  const rows: Array<Partial<AmexTransaction>> = [];
  for (const token of tokens) {
    const txns = await fetchTokenTransactions(token, start_date, end_date);
    for (const t of txns) {
      rows.push({
        transaction_date: t.date,
        amount: typeof t.amount === 'number' ? t.amount : 0,
        merchant_name: t.merchant_name || t.name || '',
        description_raw: t.name || '',
        category: t.personal_finance_category?.primary || (t.category && t.category[0]) || '',
        card_last4: (t as any).__mask ? String((t as any).__mask).slice(-4) : '',
        cardholder_name: (t as any).__acctName || '',
        reference_number: t.transaction_id || '',
        source: 'plaid',
      });
    }
  }

  const result = bulkInsert(rows);
  markSynced();
  return { ...result, total: rows.length };
}
