/**
 * POST /api/receipts/integrations/plaid/link-token — create a Plaid Link token
 * for the browser to open Plaid Link with.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { createLinkToken } from '@/lib/receipts/plaid-sync';

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const linkToken = await createLinkToken(user.email);
    return NextResponse.json({ link_token: linkToken });
  } catch (err: any) {
    console.error('[receipts/integrations/plaid/link-token] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Could not create link token' }, { status: 400 });
  }
}
