/**
 * lib/receipts/db-store.ts
 *
 * All direct database reads and writes for the receipts module live here.
 * This keeps SQL out of route handlers and service logic.
 *
 * Table: receipts (created in lib/db/client.ts → runMigrations())
 *   id            TEXT PRIMARY KEY
 *   vendor        TEXT
 *   amount        REAL
 *   date          TEXT          (ISO 8601 date string)
 *   gl_account    TEXT          (GL account code from chart of accounts)
 *   location      TEXT          (PCS practice / office)
 *   card_last4    TEXT          (last 4 digits of Amex card)
 *   match_status  TEXT          ('unmatched' | 'matched' | 'disputed')
 *   amex_txn_id   TEXT          (Amex transaction ID from Plaid / Amex API)
 *   submitted_by  TEXT          (user email)
 *   notes         TEXT
 *   image_path    TEXT          (path to uploaded receipt image / PDF)
 *   created_at    TEXT
 *   updated_at    TEXT
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/client';

export type MatchStatus = 'unmatched' | 'matched' | 'disputed';

export interface Receipt {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  gl_account: string;
  location: string;
  card_last4: string;
  match_status: MatchStatus;
  amex_txn_id: string | null;
  submitted_by: string;
  notes: string;
  image_path: string | null;
  report_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptFilters {
  matchStatus?: MatchStatus;
  submittedBy?: string;
  search?: string;
}

export interface ReceiptStats {
  total_count: number;
  total_amount: number;
  matched: number;
  unmatched: number;
  disputed: number;
  match_pct: number;
}

// Fields a client is allowed to set on update. `id`/`created_at` are never writable.
const UPDATABLE_FIELDS: Array<keyof Receipt> = [
  'vendor',
  'amount',
  'date',
  'gl_account',
  'location',
  'card_last4',
  'match_status',
  'amex_txn_id',
  'submitted_by',
  'notes',
  'image_path',
];

function nowIso(): string {
  return new Date().toISOString();
}

export function getAllReceipts(filters: ReceiptFilters = {}): Receipt[] {
  const db = getDatabase();
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.matchStatus) {
    where.push('match_status = @matchStatus');
    params.matchStatus = filters.matchStatus;
  }
  if (filters.submittedBy) {
    where.push('submitted_by = @submittedBy');
    params.submittedBy = filters.submittedBy;
  }
  if (filters.search) {
    where.push(
      '(LOWER(vendor) LIKE @search OR LOWER(notes) LIKE @search OR LOWER(gl_account) LIKE @search)'
    );
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM receipts ${clause} ORDER BY datetime(created_at) DESC`)
    .all(params) as Receipt[];
}

export function getReceiptById(id: string): Receipt | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as Receipt | undefined;
  return row ?? null;
}

export function createReceipt(data: Partial<Receipt>): Receipt {
  const db = getDatabase();
  const id = data.id || randomUUID();
  const now = nowIso();

  db.prepare(
    `INSERT INTO receipts (
       id, vendor, amount, date, gl_account, location, card_last4,
       match_status, amex_txn_id, submitted_by, notes, image_path,
       created_at, updated_at
     ) VALUES (
       @id, @vendor, @amount, @date, @gl_account, @location, @card_last4,
       @match_status, @amex_txn_id, @submitted_by, @notes, @image_path,
       @created_at, @updated_at
     )`
  ).run({
    id,
    vendor: data.vendor ?? '',
    amount: typeof data.amount === 'number' ? data.amount : 0,
    date: data.date ?? '',
    gl_account: data.gl_account ?? '',
    location: data.location ?? '',
    card_last4: data.card_last4 ?? '',
    match_status: (data.match_status as MatchStatus) ?? 'unmatched',
    amex_txn_id: data.amex_txn_id ?? null,
    submitted_by: data.submitted_by ?? '',
    notes: data.notes ?? '',
    image_path: data.image_path ?? null,
    created_at: now,
    updated_at: now,
  });

  return getReceiptById(id)!;
}

export function updateReceipt(id: string, data: Partial<Receipt>): Receipt | null {
  const db = getDatabase();
  const existing = getReceiptById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const field of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      sets.push(`${field} = @${field}`);
      params[field] = (data as Record<string, unknown>)[field];
    }
  }

  if (sets.length === 0) return existing; // nothing to update

  sets.push('updated_at = @updated_at');
  params.updated_at = nowIso();

  db.prepare(`UPDATE receipts SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getReceiptById(id);
}

export function deleteReceipt(id: string): boolean {
  const db = getDatabase();
  const info = db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
  return info.changes > 0;
}

export function getReceiptStats(filters: ReceiptFilters = {}): ReceiptStats {
  const receipts = getAllReceipts(filters);
  const total_count = receipts.length;
  const total_amount = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const matched = receipts.filter((r) => r.match_status === 'matched').length;
  const disputed = receipts.filter((r) => r.match_status === 'disputed').length;
  const unmatched = receipts.filter((r) => r.match_status === 'unmatched').length;
  const match_pct = total_count > 0 ? Math.round((matched / total_count) * 100) : 0;

  return {
    total_count,
    total_amount: Math.round(total_amount * 100) / 100,
    matched,
    unmatched,
    disputed,
    match_pct,
  };
}
