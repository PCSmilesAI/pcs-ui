// app/api/stripe/webhook/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { setByAccountId } from '@/lib/payments/vendorStore';
import { wasSeen, recordEventId } from '@/lib/stripe/eventLog';
import { markPaid } from '../../../../lib/workflow/engine';
import { getById, save } from '../../../../lib/workflow/invoiceStore';

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

  // Idempotency guard
  if (await wasSeen(event.id)) {
    console.log('[STRIPE][WEBHOOK] duplicate ignored', { id: event.id, type: event.type });
    return json(200, { ok: true, duplicate: true });
  }
  await recordEventId(event.id);
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
        const isPaymentSuccess =
          event.type === 'payment_intent.succeeded' || event.type === 'charge.succeeded';

        if (isPaymentSuccess) {
          await reconcileInvoicePayment(event, obj);
        }

        if (!accountId) break; // No connected account context for ACH updates

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

async function reconcileInvoicePayment(event: Stripe.Event, obj: any): Promise<void> {
  try {
    const metadata = {
      ...(obj?.metadata || {}),
      ...(obj?.charges?.data?.[0]?.metadata || {}),
    } as Record<string, string>;

    const invoiceId =
      metadata?.invoiceId ||
      metadata?.invoice_id ||
      metadata?.invoice ||
      metadata?.workflow_invoice_id ||
      metadata?.pcs_invoice_id;

    if (!invoiceId) {
      console.log('[STRIPE][WEBHOOK] no invoice metadata on payment', {
        id: obj?.id,
        type: event.type,
      });
      return;
    }

    const invoice = await getById(String(invoiceId));
    if (!invoice) {
      console.warn('[STRIPE][WEBHOOK] payment metadata invoice not found', {
        invoiceId,
        paymentId: obj?.id,
      });
      return;
    }

    if ((invoice.status || '').toLowerCase() === 'paid') {
      console.log('[STRIPE][WEBHOOK] invoice already paid, skipping', {
        invoiceId,
        paymentId: obj?.id,
      });
      return;
    }

    const emailCandidates = [
      metadata?.userEmail,
      metadata?.email,
      obj?.receipt_email,
      obj?.customer_email,
      obj?.charges?.data?.[0]?.billing_details?.email,
    ].filter(Boolean);
    const payerEmail = (emailCandidates[0] as string | undefined) || 'stripe@pcsmilesai.com';

    const amountCents =
      typeof obj?.amount_received === 'number'
        ? obj.amount_received
        : typeof obj?.amount === 'number'
          ? obj.amount
          : undefined;
    const total =
      typeof amountCents === 'number'
        ? Number((amountCents / 100).toFixed(2))
        : metadata?.total || metadata?.amount;

    const stripePaymentId =
      obj?.id ||
      obj?.payment_intent ||
      obj?.latest_charge ||
      (obj?.charges?.data?.[0]?.id as string | undefined) ||
      event.id;

    markPaid(invoice, {
      by: payerEmail,
      at: new Date().toISOString(),
      stripePaymentId,
      total,
    });
    await save(invoice);
    console.log('[STRIPE][WEBHOOK] invoice marked paid', {
      invoiceId,
      stripePaymentId,
      status: invoice.status,
    });
  } catch (error: any) {
    console.error('[STRIPE][WEBHOOK] reconcileInvoicePayment error', {
      message: error?.message,
      type: event.type,
    });
  }
}
