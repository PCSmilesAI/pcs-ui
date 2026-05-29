/**
 * lib/receipts/plaid-sync.ts
 *
 * Pull Amex card transactions from Plaid into the amex_transactions table, in
 * the same shape statement-import produces (so reconcile + dedupe just work).
 *
 * Uses the Plaid REST API directly via fetch — no SDK dependency. Env-gated and
 * degrades with a clear error when not configured:
 *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ACCESS_TOKEN, PLAID_ENV (sandbox|development|production)
 *
 * NOTE: untested against a live Plaid item (no credentials in this environment).
 * The request/response mapping follows Plaid's /transactions/get contract.
 */

import { bulkInsert, type AmexTransaction } from './transactions-store';

export function isPlaidConfigured(): boolean {
  return !!(
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET &&
    process.env.PLAID_ACCESS_TOKEN
  );
}

function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  if (env === 'production') return 'https://production.plaid.com';
  if (env === 'development') return 'https://development.plaid.com';
  return 'https://sandbox.plaid.com';
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

/**
 * Sync transactions for the configured Plaid item into amex_transactions.
 * Returns the import summary (inserted/skipped/total).
 */
export async function syncAmexFromPlaid(opts: { startDate?: string; endDate?: string } = {}): Promise<{
  inserted: number;
  skipped: number;
  total: number;
}> {
  if (!isPlaidConfigured()) {
    throw new Error(
      'Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ACCESS_TOKEN (and PLAID_ENV).'
    );
  }

  const start_date = opts.startDate || isoDaysAgo(90);
  const end_date = opts.endDate || new Date().toISOString().slice(0, 10);
  const url = `${plaidBaseUrl()}/transactions/get`;

  const all: PlaidTxn[] = [];
  const accountsById = new Map<string, PlaidAccount>();
  let offset = 0;
  let total = Infinity;

  // Paginate (Plaid returns total_transactions; page with count/offset).
  while (offset < total) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        access_token: process.env.PLAID_ACCESS_TOKEN,
        start_date,
        end_date,
        options: { count: 500, offset },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Plaid /transactions/get failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    const json: any = await res.json();
    total = json.total_transactions ?? (json.transactions || []).length;
    for (const a of (json.accounts || []) as PlaidAccount[]) accountsById.set(a.account_id, a);
    const batch: PlaidTxn[] = json.transactions || [];
    all.push(...batch);
    if (batch.length === 0) break;
    offset += batch.length;
  }

  const rows: Array<Partial<AmexTransaction>> = all.map((t) => {
    const acct = t.account_id ? accountsById.get(t.account_id) : undefined;
    return {
      transaction_date: t.date,
      amount: typeof t.amount === 'number' ? t.amount : 0,
      merchant_name: t.merchant_name || t.name || '',
      description_raw: t.name || '',
      category: t.personal_finance_category?.primary || (t.category && t.category[0]) || '',
      card_last4: acct?.mask ? acct.mask.slice(-4) : '',
      cardholder_name: acct?.name || '',
      reference_number: t.transaction_id || '',
      source: 'plaid',
    };
  });

  const result = bulkInsert(rows);
  return { ...result, total: rows.length };
}
