import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    const email = (user.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const markAll = Boolean(body?.all);

    const db = getDatabase();
    const now = new Date().toISOString();

    if (markAll) {
      db.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE LOWER(user_email) = ? AND read_at IS NULL
      `).run(now, email);
    } else if (ids.length > 0) {
      const stmt = db.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE id = ? AND LOWER(user_email) = ?
      `);
      const tx = db.transaction(() => {
        for (const id of ids) {
          stmt.run(now, id, email);
        }
      });
      tx();
    } else {
      return NextResponse.json({ error: 'Provide ids[] or all: true' }, { status: 400 });
    }

    const unreadCountRow = db.prepare(`
      SELECT COUNT(*) as c FROM notifications
      WHERE LOWER(user_email) = ? AND read_at IS NULL
    `).get(email) as { c: number };

    return NextResponse.json({
      ok: true,
      unread_count: unreadCountRow?.c || 0,
    });
  } catch (err: any) {
    console.error('[NOTIFICATIONS] mark-read error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Failed to mark notifications read' },
      { status: 500 }
    );
  }
}
