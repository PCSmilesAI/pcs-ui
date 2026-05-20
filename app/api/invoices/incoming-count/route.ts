import { NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM invoices WHERE status = ? AND deleted = 0'
    ).get('incoming') as { count: number };

    return NextResponse.json({ count: row?.count || 0 });
  } catch (err: any) {
    console.error('[INCOMING_COUNT] Error:', err?.message);
    return NextResponse.json({ count: 0 });
  }
}
