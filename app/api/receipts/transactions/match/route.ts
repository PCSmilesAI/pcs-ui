/**
 * POST /api/receipts/transactions/match — reconcile the whole feed: match every
 * unmatched receipt against unmatched Amex transactions and persist the links.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { runAutoMatch } from '@/lib/receipts/receipt-service';

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await runAutoMatch();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[receipts/transactions/match] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
