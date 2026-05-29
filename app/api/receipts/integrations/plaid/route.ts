/**
 * GET    /api/receipts/integrations/plaid           — connection status + connected items (no tokens)
 * DELETE /api/receipts/integrations/plaid?item_id=…  — disconnect an item
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { hasPlaidCredentials } from '@/lib/receipts/plaid-sync';
import { listPublicItems, deleteItem } from '@/lib/receipts/plaid-store';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    linkConfigured: hasPlaidCredentials(),
    env: process.env.PLAID_ENV || 'sandbox',
    items: listPublicItems(),
  });
}

export async function DELETE(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const itemId = req.nextUrl.searchParams.get('item_id');
    if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    const ok = deleteItem(itemId);
    if (!ok) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ ok: true, item_id: itemId });
  } catch (err: any) {
    console.error('[receipts/integrations/plaid] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
