import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// REMOVE THIS LINE (deprecated and causes build failure):
// export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  const verifier = process.env.QBO_WEBHOOK_VERIFIER || '';
  const signature = req.headers.get('intuit-signature') || '';

  // If webhook verifier is not configured, skip validation (webhooks not enabled)
  if (!verifier) {
    return NextResponse.json({ ok: true, message: 'Webhook verifier not configured' });
  }

  const expected = crypto.createHmac('sha256', verifier).update(raw).digest('base64');
  if (!signature || signature !== expected) {
    // Log at debug level - this happens when QBO sends test webhooks or verifier is mismatched
    console.log('[QBO][WEBHOOK] Signature mismatch - verify QBO_WEBHOOK_VERIFIER is correct');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const body = JSON.parse(raw.toString('utf8'));
  const events = body?.eventNotifications || [];
  for (const n of events) {
    const realmId = n.realmId;
    for (const e of (n.dataChangeEvent?.entities || [])) {
      console.log(`[QBO] ${e.name} ${e.operation} id=${e.id} realm=${realmId}`);
      // later: fetch entity + sync to PCS DB
    }
  }
  return NextResponse.json({ ok: true });
}
