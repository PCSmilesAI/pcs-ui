// app/api/stripe/webhook/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { setByAccountId } from '@/lib/payments/vendorStore';

// Ensure Node.js runtime and no static caching for webhooks
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Instantiate Stripe at request time to avoid build-time env coupling
function getStripe(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  return new Stripe(secret, { apiVersion: '2024-06-20' });
}

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const hdrs = headers();
  const signature = hdrs.get('stripe-signature');
  const webhookSecret = process.env.PCS_STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[STRIPE][WEBHOOK] Missing PCS_STRIPE_WEBHOOK_SECRET');
    return json(500, { ok: false, error: 'server webhook secret not set' });
  }
  if (!signature) {
    console.error('[STRIPE][WEBHOOK] Missing stripe-signature header');
    return json(400, { ok: false, error: 'missing stripe-signature' });
  }

  // IMPORTANT: raw body, not req.json()
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const client = getStripe();
    if (!client) {
      console.error('[STRIPE][WEBHOOK] Missing STRIPE_SECRET_KEY at runtime');
      return json(500, { ok: false, error: 'stripe not configured' });
    }
    event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('[STRIPE][WEBHOOK] Signature verification failed:', err?.message);
    return json(400, { ok: false, error: `invalid signature: ${err?.message || 'unknown'}` });
  }

  // Minimal log to confirm receipt
  console.log('[STRIPE][WEBHOOK] received', { id: event.id, type: event.type });

  // Try to derive the connected account ID (for Connect)
  const obj: any = (event.data && (event.data as any).object) || {};
  const accountId: string | undefined = (event as any).account || (obj?.object === 'account' ? obj.id : undefined);

  // If we can derive ACH status from the object (for account.* events), do so.
  // Otherwise, you can expand this to fetch the account with stripe.accounts.retrieve(accountId)
  // if you need a definitive, fresh status for other event types.
  const capabilities = obj?.capabilities || {};
  const transfersActive = capabilities?.transfers === 'active';
  const externalCount: number =
    (obj?.external_accounts && typeof obj.external_accounts.total_count === 'number')
      ? obj.external_accounts.total_count
      : 0;

  // Compute ACH status with a simple heuristic:
  // - complete: transfers active AND at least one external account on file
  // - pending: either transfers active OR has an external account, but not both
  // - missing: neither condition met, or no account context
  let achStatus: 'complete' | 'pending' | 'missing' = 'missing';
  if (accountId) {
    if (transfersActive && externalCount > 0) achStatus = 'complete';
    else if (transfersActive || externalCount > 0) achStatus = 'pending';
  }

  try {
    // Handle only the events you care about; others will no-op but still return 200
    switch (event.type) {
      // Account status / onboarding progression
      case 'account.updated':
      case 'account.external_account.created':
      case 'account.external_account.deleted':
      case 'account.external_account.updated':
      case 'capability.updated':
      // Setup intents for ACH debit mandates / payment method collection
      case 'setup_intent.succeeded':
      case 'setup_intent.setup_failed':
      // Payments lifecycle (if you reflect these in your UI)
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'charge.succeeded':
      case 'charge.failed': {
        if (!accountId) break; // No connected account context; nothing to update

        // If this isn't an account.* event, you may want to fetch the latest account
        // snapshot to compute achStatus precisely. Example:
        //
        // const acct = await stripe.accounts.retrieve(accountId);
        // const transfersActive2 = acct.capabilities?.transfers === 'active';
        // const externalCount2 = (acct.external_accounts?.total_count as number) || 0;
        // achStatus = transfersActive2 && externalCount2 > 0 ? 'complete'
        //           : (transfersActive2 || externalCount2 > 0) ? 'pending'
        //           : 'missing';

        const updated = await setByAccountId(accountId, { ach_status: achStatus });
        console.log('[STRIPE][WEBHOOK]', event.type, { acct: accountId, ach_status: achStatus, updated });
        break;
      }

      default:
        // No-op: safely acknowledge all other events
        break;
    }

    return json(200, { ok: true, type: event.type });
  } catch (err: any) {
    console.error('[STRIPE][WEBHOOK] Handler error:', err);
    return json(500, { ok: false, error: 'handler error' });
  }
}
