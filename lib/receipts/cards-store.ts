/**
 * lib/receipts/cards-store.ts
 *
 * Corporate-card roster for the receipts module. A "card" is a distinct
 * card_last4 seen across amex_transactions / receipts, optionally assigned to a
 * managing user via the card_assignments table.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/client';

export interface CardAssignment {
  id: string;
  card_last4: string;
  cardholder_name: string;
  assignee_email: string;
  assigned_by: string;
  assigned_at: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CardRow {
  card_last4: string;
  cardholder_name: string;
  assignee_email: string | null;
  txn_count: number;
  receipt_count: number;
  assigned: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build the card roster by unioning card_last4 from transactions + receipts and
 * joining the active assignment (if any).
 */
export function listCards(): CardRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
      WITH cards AS (
        SELECT card_last4 FROM amex_transactions WHERE card_last4 IS NOT NULL AND card_last4 <> ''
        UNION
        SELECT card_last4 FROM receipts WHERE card_last4 IS NOT NULL AND card_last4 <> ''
        UNION
        SELECT card_last4 FROM card_assignments WHERE card_last4 IS NOT NULL AND card_last4 <> ''
      )
      SELECT
        c.card_last4 AS card_last4,
        COALESCE(ca.cardholder_name, (
          SELECT cardholder_name FROM amex_transactions a
          WHERE a.card_last4 = c.card_last4 AND a.cardholder_name IS NOT NULL AND a.cardholder_name <> ''
          LIMIT 1
        ), '') AS cardholder_name,
        ca.assignee_email AS assignee_email,
        (SELECT COUNT(*) FROM amex_transactions a WHERE a.card_last4 = c.card_last4) AS txn_count,
        (SELECT COUNT(*) FROM receipts r WHERE r.card_last4 = c.card_last4) AS receipt_count
      FROM cards c
      LEFT JOIN card_assignments ca ON ca.card_last4 = c.card_last4 AND ca.is_active = 1
      ORDER BY c.card_last4
    `
    )
    .all() as Array<Omit<CardRow, 'assigned'>>;

  return rows.map((r) => ({ ...r, assigned: !!r.assignee_email }));
}

export function getAssignment(cardLast4: string): CardAssignment | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM card_assignments WHERE card_last4 = ?')
    .get(cardLast4) as CardAssignment | undefined;
  return row ?? null;
}

/** Assign (or reassign) a card to a user. Upserts on card_last4. */
export function assignCard(data: {
  card_last4: string;
  assignee_email: string;
  cardholder_name?: string;
  assigned_by?: string;
}): CardAssignment {
  const db = getDatabase();
  const now = nowIso();
  const existing = getAssignment(data.card_last4);

  if (existing) {
    db.prepare(
      `UPDATE card_assignments
       SET assignee_email = @assignee_email,
           cardholder_name = COALESCE(NULLIF(@cardholder_name, ''), cardholder_name),
           assigned_by = @assigned_by, assigned_at = @now, is_active = 1, updated_at = @now
       WHERE card_last4 = @card_last4`
    ).run({
      card_last4: data.card_last4,
      assignee_email: data.assignee_email,
      cardholder_name: data.cardholder_name ?? '',
      assigned_by: data.assigned_by ?? '',
      now,
    });
  } else {
    db.prepare(
      `INSERT INTO card_assignments
         (id, card_last4, cardholder_name, assignee_email, assigned_by, assigned_at, is_active, created_at, updated_at)
       VALUES (@id, @card_last4, @cardholder_name, @assignee_email, @assigned_by, @now, 1, @now, @now)`
    ).run({
      id: randomUUID(),
      card_last4: data.card_last4,
      cardholder_name: data.cardholder_name ?? '',
      assignee_email: data.assignee_email,
      assigned_by: data.assigned_by ?? '',
      now,
    });
  }
  return getAssignment(data.card_last4)!;
}

/** Remove an assignment (deactivate). */
export function unassignCard(cardLast4: string): boolean {
  const db = getDatabase();
  const info = db.prepare('DELETE FROM card_assignments WHERE card_last4 = ?').run(cardLast4);
  return info.changes > 0;
}

export function getCardStats(): { total: number; assigned: number; unassigned: number } {
  const cards = listCards();
  const assigned = cards.filter((c) => c.assigned).length;
  return { total: cards.length, assigned, unassigned: cards.length - assigned };
}
