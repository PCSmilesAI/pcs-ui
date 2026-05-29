/**
 * lib/receipts/transactions-store.ts
 *
 * Amex transaction feed for the receipts module. Rows arrive via statement
 * import (CSV/XLSX) today; a Plaid sync can write the same shape later.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/client';

export type TxnMatchStatus = 'unmatched' | 'matched' | 'needs_review';

export interface AmexTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  merchant_name: string;
  description_raw: string;
  category: string;
  card_last4: string;
  cardholder_name: string;
  reference_number: string;
  match_status: TxnMatchStatus;
  matched_receipt_id: string | null;
  match_score: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface TxnFilters {
  matchStatus?: TxnMatchStatus;
  cardLast4?: string;
  search?: string;
}

export interface TxnStats {
  total_count: number;
  total_amount: number;
  matched: number;
  unmatched: number;
  match_pct: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listTransactions(filters: TxnFilters = {}): AmexTransaction[] {
  const db = getDatabase();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.matchStatus) {
    where.push('match_status = @matchStatus');
    params.matchStatus = filters.matchStatus;
  }
  if (filters.cardLast4) {
    where.push('card_last4 = @cardLast4');
    params.cardLast4 = filters.cardLast4;
  }
  if (filters.search) {
    where.push('(LOWER(merchant_name) LIKE @search OR LOWER(description_raw) LIKE @search)');
    params.search = `%${filters.search.toLowerCase()}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM amex_transactions ${clause} ORDER BY date(transaction_date) DESC, created_at DESC`)
    .all(params) as AmexTransaction[];
}

export function getTransactionById(id: string): AmexTransaction | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM amex_transactions WHERE id = ?').get(id) as
    | AmexTransaction
    | undefined;
  return row ?? null;
}

/**
 * Insert a batch of transactions. Relies on the unique dedupe index
 * (transaction_date, amount, merchant_name, card_last4) to skip duplicates.
 */
export function bulkInsert(rows: Array<Partial<AmexTransaction>>): { inserted: number; skipped: number } {
  const db = getDatabase();
  const now = nowIso();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO amex_transactions
       (id, transaction_date, amount, merchant_name, description_raw, category,
        card_last4, cardholder_name, reference_number, match_status,
        matched_receipt_id, match_score, source, created_at, updated_at)
     VALUES (@id, @transaction_date, @amount, @merchant_name, @description_raw, @category,
        @card_last4, @cardholder_name, @reference_number, 'unmatched',
        NULL, NULL, @source, @now, @now)`
  );

  let inserted = 0;
  const insertMany = db.transaction((items: Array<Partial<AmexTransaction>>) => {
    for (const r of items) {
      const info = stmt.run({
        id: randomUUID(),
        transaction_date: r.transaction_date ?? '',
        amount: typeof r.amount === 'number' ? r.amount : 0,
        merchant_name: r.merchant_name ?? '',
        description_raw: r.description_raw ?? '',
        category: r.category ?? '',
        card_last4: r.card_last4 ?? '',
        cardholder_name: r.cardholder_name ?? '',
        reference_number: r.reference_number ?? '',
        source: r.source ?? 'import',
        now,
      });
      inserted += info.changes;
    }
  });
  insertMany(rows);
  return { inserted, skipped: rows.length - inserted };
}

export function updateTransaction(id: string, data: Partial<AmexTransaction>): AmexTransaction | null {
  const db = getDatabase();
  const existing = getTransactionById(id);
  if (!existing) return null;
  const allowed: Array<keyof AmexTransaction> = [
    'transaction_date', 'amount', 'merchant_name', 'description_raw', 'category',
    'card_last4', 'cardholder_name', 'reference_number', 'match_status',
    'matched_receipt_id', 'match_score',
  ];
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const f of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, f)) {
      sets.push(`${f} = @${f}`);
      params[f] = (data as Record<string, unknown>)[f];
    }
  }
  if (!sets.length) return existing;
  sets.push('updated_at = @updated_at');
  params.updated_at = nowIso();
  db.prepare(`UPDATE amex_transactions SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getTransactionById(id);
}

export function deleteTransaction(id: string): boolean {
  const db = getDatabase();
  return db.prepare('DELETE FROM amex_transactions WHERE id = ?').run(id).changes > 0;
}

export function getTransactionStats(filters: TxnFilters = {}): TxnStats {
  const txns = listTransactions(filters);
  const total_count = txns.length;
  const total_amount = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const matched = txns.filter((t) => t.match_status === 'matched').length;
  const unmatched = txns.filter((t) => t.match_status === 'unmatched').length;
  return {
    total_count,
    total_amount: Math.round(total_amount * 100) / 100,
    matched,
    unmatched,
    match_pct: total_count ? Math.round((matched / total_count) * 100) : 0,
  };
}
