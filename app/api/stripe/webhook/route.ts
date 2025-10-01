import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { setVendorStatus } from '@/lib/payments/vendorPayments';
import { getVendorsForAccount } from '@/lib/payments/vendorStripeMap';

export async function POST(request: Request) {
  const sig = (await headers()).get('stripe-signature') || '';
  const whSecret = process.env.PCS_STRIPE_WEBHOOK_SECRET;
  if (!whSecret) return NextResponse.json({ ok: false, error: 'Webhook secret missing' }, { status: 500 });

  const raw = await request.text();

  let evt: any;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Invalid signature: ${err.message}` }, { status: 400 });
  }

  // Handle selective events
  try {
    const type = evt.type as string;
    const obj = evt.data?.object || {};
    const accountId = (obj.id && obj.object === 'account') ? obj.id : (evt.account || '');

    if (accountId) {
      // Determine status
      let ach: 'complete' | 'pending' | 'missing' = 'missing';
      const capabilities = obj.capabilities || {};
      const transfersActive = capabilities.transfers === 'active';
      const external = obj.external_accounts?.total_count || 0;
      if (transfersActive && external > 0) ach = 'complete';
      else if (transfersActive || external > 0) ach = 'pending';

      const vendors = getVendorsForAccount(accountId);
      for (const v of vendors) {
        await setVendorStatus(v, {
          stripeAccountId: accountId,
          ach_status: ach,
          last_event: type,
        });
      }
      console.log('[STRIPE][WEBHOOK]', type, { acct: accountId, ach_status: ach, vendorsUpdated: vendors });
    }
  } catch (err) {
    console.error('[STRIPE][WEBHOOK] handler error', err);
  }

  return NextResponse.json({ ok: true, type: evt.type }, { status: 200 });
}


