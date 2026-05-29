/**
 * lib/receipts/plaid-store.ts
 *
 * Persistence for Plaid-connected items (institutions). The access_token is a
 * secret at rest and is never exposed by the API layer — only listPublicItems()
 * (which omits it) is returned to clients.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/client';

export interface PlaidItem {
  id: string;
  item_id: string;
  access_token: string;
  institution_name: string;
  connected_by: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PlaidItemPublic = Omit<PlaidItem, 'access_token'>;

function nowIso(): string {
  return new Date().toISOString();
}

export function saveItem(data: {
  item_id: string;
  access_token: string;
  institution_name?: string;
  connected_by?: string;
}): PlaidItem {
  const db = getDatabase();
  const now = nowIso();
  const existing = db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(data.item_id) as
    | PlaidItem
    | undefined;
  if (existing) {
    db.prepare(
      `UPDATE plaid_items
       SET access_token = @access_token,
           institution_name = COALESCE(NULLIF(@institution_name, ''), institution_name),
           updated_at = @now
       WHERE item_id = @item_id`
    ).run({ ...data, institution_name: data.institution_name ?? '', now });
  } else {
    db.prepare(
      `INSERT INTO plaid_items
         (id, item_id, access_token, institution_name, connected_by, last_synced_at, created_at, updated_at)
       VALUES (@id, @item_id, @access_token, @institution_name, @connected_by, NULL, @now, @now)`
    ).run({
      id: randomUUID(),
      item_id: data.item_id,
      access_token: data.access_token,
      institution_name: data.institution_name ?? '',
      connected_by: data.connected_by ?? '',
      now,
    });
  }
  return db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(data.item_id) as PlaidItem;
}

export function listItems(): PlaidItem[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM plaid_items ORDER BY datetime(created_at) DESC').all() as PlaidItem[];
}

export function listPublicItems(): PlaidItemPublic[] {
  return listItems().map((i) => ({
    id: i.id,
    item_id: i.item_id,
    institution_name: i.institution_name,
    connected_by: i.connected_by,
    last_synced_at: i.last_synced_at,
    created_at: i.created_at,
    updated_at: i.updated_at,
  }));
}

export function getAccessTokens(): string[] {
  return listItems()
    .map((i) => i.access_token)
    .filter(Boolean);
}

export function markSynced(): void {
  const db = getDatabase();
  db.prepare('UPDATE plaid_items SET last_synced_at = ?').run(nowIso());
}

export function deleteItem(itemId: string): boolean {
  const db = getDatabase();
  return db.prepare('DELETE FROM plaid_items WHERE item_id = ?').run(itemId).changes > 0;
}
