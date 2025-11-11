import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { loadMap, findVendorKey } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const vendorParam = (url.searchParams.get('vendor') || '').trim();
    const explicitAcct = (url.searchParams.get('accountId') || '').trim();

    // SECURITY: Validate input parameters
    if (vendorParam && (vendorParam.length > 255 || !/^[a-zA-Z0-9\s\-&.,()]+$/.test(vendorParam))) {
      console.warn('[VENDOR_ACH_INFO] Invalid vendor parameter', { vendor: vendorParam });
      return json(400, { ok: false, error: 'Invalid vendor name' });
    }

    if (explicitAcct && (explicitAcct.length > 100 || !/^[a-zA-Z0-9_\-]+$/.test(explicitAcct))) {
      console.warn('[VENDOR_ACH_INFO] Invalid accountId parameter', { accountId: explicitAcct });
      return json(400, { ok: false, error: 'Invalid account ID' });
    }

    const map = await loadMap();

    let vendorName: string | undefined;
    let stripeAccountId: string | undefined = explicitAcct || undefined;
    let achStatus: string | undefined = undefined;

    if (!stripeAccountId) {
      const key = vendorParam ? findVendorKey(map, vendorParam) : undefined;
      if (key) {
        vendorName = key;
        stripeAccountId = map.vendors[key]?.stripeAccountId;
        achStatus = map.vendors[key]?.ach_status;
      }
    }

    if (!stripeAccountId) {
      return json(200, {
        ok: true,
        vendor: vendorName || vendorParam || null,
        ach_status: achStatus || 'missing',
        stripeAccountId: null,
        bank: null,
        address: null,
      });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error('[VENDOR_ACH_INFO] Missing STRIPE_SECRET_KEY');
      return json(500, { ok: false, error: 'server missing Stripe credentials' });
    }

    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

    // Retrieve account and first external bank account (if any)
    const account = await stripe.accounts.retrieve(stripeAccountId);
    const banks = await stripe.accounts.listExternalAccounts(stripeAccountId, {
      object: 'bank_account',
      limit: 1,
    });

    const bank = banks.data[0] as Stripe.BankAccount | undefined;

    const bankName = bank?.bank_name || undefined;
    const last4 = bank?.last4 || undefined;
    const acctMasked = last4 ? `XXXXX${last4}` : undefined;
    const routing = (bank as any)?.routing_number as string | undefined;
    const routingLast4 = routing ? routing.slice(-4) : undefined;
    const routingMasked = routingLast4 ? `XXXXX${routingLast4}` : undefined;
    const currency = bank?.currency || undefined;
    const country = bank?.country || undefined;

    const addr = (account as any)?.company?.address || (account as any)?.individual?.address || null;
    const addressParts = addr
      ? [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country]
          .filter(Boolean)
          .join(', ')
      : null;

    // Derive ACH status if not present in store
    const capabilities: any = (account as any).capabilities || {};
    const transfersActive = capabilities?.transfers === 'active';
    const externalCount = typeof (account as any)?.external_accounts?.total_count === 'number'
      ? (account as any).external_accounts.total_count
      : banks.data.length;
    const derivedStatus = transfersActive && externalCount > 0
      ? 'complete'
      : transfersActive || externalCount > 0
        ? 'pending'
        : 'missing';

    return json(200, {
      ok: true,
      vendor: vendorName || vendorParam || null,
      stripeAccountId,
      ach_status: derivedStatus,
      bank: bank
        ? {
            bank_name: bankName,
            account_last4: last4,
            account_masked: acctMasked,
            routing_last4: routingLast4,
            routing_masked: routingMasked,
            currency,
            country,
          }
        : null,
      address: addressParts,
    });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[VENDOR_ACH_INFO] Error:', err?.message || err);
    // Return safe error message to client
    return json(500, { ok: false, error: 'Failed to retrieve ACH information' });
  }
}


