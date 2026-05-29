/**
 * POST /api/receipts/integrations/plaid/exchange — exchange a Plaid public_token
 * (from Link onSuccess) for an access_token and store the connected item.
 * Body: { public_token, institution_name? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { exchangePublicToken } from '@/lib/receipts/plaid-sync';

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (!body?.public_token) {
      return NextResponse.json({ error: 'public_token is required' }, { status: 400 });
    }
    const result = await exchangePublicToken(String(body.public_token), {
      institutionName: body.institution_name ? String(body.institution_name) : '',
      connectedBy: user.email,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts/integrations/plaid/exchange] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Exchange failed' }, { status: 400 });
  }
}
