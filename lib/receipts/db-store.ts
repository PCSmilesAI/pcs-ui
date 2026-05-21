/**
 * lib/receipts/db-store.ts
 *
 * All direct database reads and writes for the receipts module live here.
 * This keeps SQL out of route handlers and service logic.
 *
 * Table: receipts
 * Columns (to be created in migration):
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
 *
 * McKay — to create this table, add a migration block inside lib/db/client.ts
 * in the runMigrations() function following the existing pattern.
 * Then implement the stub functions below.
 */

import { getDatabase } from '../db/client';

export interface Receipt {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  gl_account: string;
  location: string;
  card_last4: string;
  match_status: 'unmatched' | 'matched' | 'disputed';
  amex_txn_id: string | null;
  submitted_by: string;
  notes: string;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllReceipts(): Receipt[] {
  const db = getDatabase();
  // TODO (McKay): implement — example:
  // return db.prepare('SELECT * FROM receipts ORDER BY created_at DESC').all() as Receipt[];
  return [];
}

export function getReceiptById(id: string): Receipt | null {
  const db = getDatabase();
  // TODO (McKay): implement — example:
  // return db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as Receipt | null;
  return null;
}

export function createReceipt(data: Partial<Receipt>): Receipt {
  const db = getDatabase();
  // TODO (McKay): generate a UUID, insert into receipts table, return the created row
  // import { randomUUID } from 'crypto';
  // const id = randomUUID();
  // const now = new Date().toISOString();
  // db.prepare(`INSERT INTO receipts (...) VALUES (...)`).run(...);
  // return getReceiptById(id)!;
  throw new Error('createReceipt not yet implemented');
}

export function updateReceipt(id: string, data: Partial<Receipt>): Receipt | null {
  const db = getDatabase();
  // TODO (McKay): build a dynamic UPDATE statement from the provided fields
  // Only allow safe fields — never allow updating `id` or `created_at`
  return null;
}
