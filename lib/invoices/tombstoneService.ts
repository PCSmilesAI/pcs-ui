/**
 * Tombstone Service
 * 
 * Manages tombstone records to prevent re-ingestion of deleted/rejected invoices.
 * When an invoice is rejected, its source_message_id is recorded in the tombstones table.
 * On ingest, we check if the source_message_id exists in tombstones and skip if found.
 */

import { getDatabase } from '../db/client';

/**
 * Check if a source_message_id has been tombstoned (deleted/rejected)
 */
export function isTombstoned(sourceMessageId: string | null | undefined): boolean {
  if (!sourceMessageId) return false;
  
  try {
    const db = getDatabase();
    const result = db.prepare(
      'SELECT 1 FROM tombstones WHERE source_message_id = ? LIMIT 1'
    ).get(sourceMessageId);
    
    return !!result;
  } catch (err: any) {
    console.error('[TOMBSTONE] Error checking tombstone:', err?.message);
    return false;
  }
}

/**
 * Create a tombstone record for a deleted/rejected invoice
 * Called when an invoice is rejected or permanently deleted
 */
export function createTombstone(sourceMessageId: string | null | undefined): void {
  if (!sourceMessageId) return;
  
  try {
    const db = getDatabase();
    
    // Insert or ignore if already exists
    db.prepare(`
      INSERT OR IGNORE INTO tombstones (source_message_id, deleted_at)
      VALUES (?, CURRENT_TIMESTAMP)
    `).run(sourceMessageId);
    
    console.log('[TOMBSTONE] Created tombstone for:', sourceMessageId);
  } catch (err: any) {
    console.error('[TOMBSTONE] Error creating tombstone:', err?.message);
  }
}

/**
 * Get all tombstoned source_message_ids
 * Useful for diagnostics and cleanup
 */
export function getAllTombstones(): Array<{ source_message_id: string; deleted_at: string }> {
  try {
    const db = getDatabase();
    return db.prepare(
      'SELECT source_message_id, deleted_at FROM tombstones ORDER BY deleted_at DESC'
    ).all() as any[];
  } catch (err: any) {
    console.error('[TOMBSTONE] Error fetching tombstones:', err?.message);
    return [];
  }
}

/**
 * Get tombstone count
 */
export function getTombstoneCount(): number {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM tombstones').get() as any;
    return result?.count || 0;
  } catch (err: any) {
    console.error('[TOMBSTONE] Error counting tombstones:', err?.message);
    return 0;
  }
}

/**
 * Remove a tombstone (resurrect an invoice)
 * Use with caution - only for admin operations
 */
export function removeTombstone(sourceMessageId: string): void {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM tombstones WHERE source_message_id = ?').run(sourceMessageId);
    console.log('[TOMBSTONE] Removed tombstone for:', sourceMessageId);
  } catch (err: any) {
    console.error('[TOMBSTONE] Error removing tombstone:', err?.message);
  }
}

/**
 * Cleanup old tombstones (older than specified days)
 * Useful for maintenance - keeps table size manageable
 */
export function cleanupOldTombstones(daysOld: number = 90): number {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM tombstones 
      WHERE deleted_at < datetime('now', '-' || ? || ' days')
    `).run(daysOld);
    
    const deleted = result.changes;
    console.log(`[TOMBSTONE] Cleaned up ${deleted} tombstones older than ${daysOld} days`);
    return deleted;
  } catch (err: any) {
    console.error('[TOMBSTONE] Error cleaning up tombstones:', err?.message);
    return 0;
  }
}

