/**
 * GET  /api/receipts/cards   — card roster (+ assigned/unassigned counts)
 * POST /api/receipts/cards   — assign/reassign a card: { card_last4, assignee_email, cardholder_name? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listCards, assignCard, getCardStats } from '@/lib/receipts/cards-store';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ cards: listCards(), stats: getCardStats() });
  } catch (err: any) {
    console.error('[receipts/cards] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (!body?.card_last4 || !body?.assignee_email) {
      return NextResponse.json({ error: 'card_last4 and assignee_email are required' }, { status: 400 });
    }
    const assignment = assignCard({
      card_last4: String(body.card_last4),
      assignee_email: String(body.assignee_email),
      cardholder_name: body.cardholder_name ? String(body.cardholder_name) : '',
      assigned_by: user.email,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts/cards] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
