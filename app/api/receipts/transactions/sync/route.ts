/**
 * GET  /api/receipts/transactions/sync — is Plaid configured? { configured: boolean }
 * POST /api/receipts/transactions/sync — pull Amex transactions from Plaid into the feed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { syncAmexFromPlaid, isPlaidConfigured } from '@/lib/receipts/plaid-sync';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ configured: isPlaidConfigured() });
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await syncAmexFromPlaid();
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('[receipts/transactions/sync] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 400 });
  }
}
