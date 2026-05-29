/**
 * DELETE /api/receipts/cards/[card] — unassign a card (card = card_last4)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { unassignCard } from '@/lib/receipts/cards-store';

export async function DELETE(req: NextRequest, { params }: { params: { card: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ok = unassignCard(params.card);
    if (!ok) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    return NextResponse.json({ ok: true, card_last4: params.card });
  } catch (err: any) {
    console.error('[receipts/cards/[card]] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
