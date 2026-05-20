import { NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Returns the count of incoming invoices that need human attention:
 * - parsing failed or partial
 * - vendor parsed as 'Unknown' or missing
 */
export async function GET() {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM invoices
      WHERE status = 'incoming' AND deleted = 0
        AND (parsing_status IN ('failed', 'partial')
             OR vendor_name = 'Unknown'
             OR vendor_name IS NULL
             OR vendor_name = '')
    `).get() as { count: number };

    return NextResponse.json({ count: row?.count || 0 });
  } catch (err: any) {
    console.error('[INCOMING_COUNT] Error:', err?.message);
    return NextResponse.json({ count: 0 });
  }
}
