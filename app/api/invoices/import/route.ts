import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../lib/db/client';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { applyCorrections } from '../../../../lib/invoices/write';

export const dynamic = 'force-dynamic';

interface ImportItem {
  id: string;
  corrected?: {
    vendor_name?: string;
    office_id?: string;
    amount_cents?: number;
  };
  lock?: string[];
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  try {
    // Check admin permission
    const userIsAdmin = await isAdmin(user.email);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const items: ImportItem[] = body?.items || [];

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    const db = getDatabase();
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const item of items) {
      try {
        const { id, corrected, lock } = item;

        if (!id) {
          results.push({ id: 'unknown', ok: false, error: 'Missing id' });
          continue;
        }

        // Apply corrections if provided
        if (corrected && Object.keys(corrected).length > 0) {
          await applyCorrections(id, user.email, corrected, true);
        }

        // Apply field locks if provided
        if (lock && Array.isArray(lock) && lock.length > 0) {
          const invoice = db.prepare('SELECT field_locks FROM invoices WHERE id = ?').get(id) as any;
          const locks = invoice?.field_locks ? JSON.parse(invoice.field_locks) : {};
          
          for (const field of lock) {
            locks[field] = true;
          }
          
          db.prepare('UPDATE invoices SET field_locks = ? WHERE id = ?')
            .run(JSON.stringify(locks), id);
          
          // Audit event
          db.prepare(`
            INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
            VALUES (?, 'FIELD_LOCKED', ?, ?)
          `).run(id, user.email, JSON.stringify({ locked_fields: lock }));
        }

        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id: item.id, ok: false, error: err?.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    console.log('[API][INVOICES][IMPORT]', 'completed', { userEmail: user.email, total: items.length, success: successCount });

    return NextResponse.json({
      ok: true,
      total: items.length,
      success: successCount,
      results,
    });
  } catch (err: any) {
    console.error('[API][INVOICES][IMPORT]', 'error', { error: err?.message });
    return NextResponse.json({ error: err?.message || 'Import failed' }, { status: 400 });
  }
}

