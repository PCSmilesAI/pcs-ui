import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { getDatabase } from '../../../lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    const email = (user.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 30), 100);
    const unreadOnly = req.nextUrl.searchParams.get('unread') === '1';

    const db = getDatabase();
    const rows = unreadOnly
      ? (db.prepare(`
          SELECT id, user_email, type, title, body, payload_json, read_at, created_at
          FROM notifications
          WHERE LOWER(user_email) = ? AND read_at IS NULL
          ORDER BY created_at DESC
          LIMIT ?
        `).all(email, limit) as any[])
      : (db.prepare(`
          SELECT id, user_email, type, title, body, payload_json, read_at, created_at
          FROM notifications
          WHERE LOWER(user_email) = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(email, limit) as any[]);

    const unreadCountRow = db.prepare(`
      SELECT COUNT(*) as c FROM notifications
      WHERE LOWER(user_email) = ? AND read_at IS NULL
    `).get(email) as { c: number };

    const notifications = rows.map((r) => ({
      ...r,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    }));

    return NextResponse.json({
      ok: true,
      unread_count: unreadCountRow?.c || 0,
      notifications,
    });
  } catch (err: any) {
    console.error('[NOTIFICATIONS] GET error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
