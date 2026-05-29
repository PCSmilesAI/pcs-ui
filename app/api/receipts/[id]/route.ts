/**
 * GET    /api/receipts/[id]   — fetch a single receipt by ID
 * PATCH  /api/receipts/[id]   — update a receipt, OR run Amex matching:
 *                                 { action: 'match', transactions: [{id,amount,date,vendor}] }
 *                               otherwise treats the body as field updates
 *                               (status, gl_account, location, notes, …).
 * DELETE /api/receipts/[id]   — delete a receipt
 *
 * Auth: import { getCurrentUser } from '@/lib/auth/currentUser';
 * DB:   field whitelisting + writes live in lib/receipts/db-store.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  getReceiptById,
  updateReceipt,
  deleteReceipt,
  type MatchStatus,
} from '@/lib/receipts/db-store';
import { matchReceiptToAmexTransaction, type AmexCandidate } from '@/lib/receipts/receipt-service';

const VALID_STATUS: MatchStatus[] = ['unmatched', 'matched', 'disputed'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipt = getReceiptById(params.id);
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }
    return NextResponse.json({ receipt });
  } catch (err: any) {
    console.error('[receipts/[id]] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipt = getReceiptById(params.id);
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const body = await req.json();

    // ─── Amex matching action ───────────────────────────────────────────────
    if (body?.action === 'match') {
      const transactions: AmexCandidate[] = Array.isArray(body.transactions)
        ? body.transactions
        : [];
      const match = await matchReceiptToAmexTransaction(
        receipt.amount,
        receipt.date,
        receipt.vendor,
        transactions
      );
      if (!match) {
        const updated = updateReceipt(params.id, { match_status: 'unmatched', amex_txn_id: null });
        return NextResponse.json({ receipt: updated, match: null });
      }
      const updated = updateReceipt(params.id, {
        match_status: 'matched',
        amex_txn_id: match.id,
      });
      return NextResponse.json({ receipt: updated, match });
    }

    // ─── Field update ─────────────────────────────────────────────────────
    if (body?.match_status && !VALID_STATUS.includes(body.match_status)) {
      return NextResponse.json({ error: 'Invalid match_status' }, { status: 400 });
    }

    const updated = updateReceipt(params.id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }
    return NextResponse.json({ receipt: updated });
  } catch (err: any) {
    console.error('[receipts/[id]] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ok = deleteReceipt(params.id);
    if (!ok) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id: params.id });
  } catch (err: any) {
    console.error('[receipts/[id]] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
