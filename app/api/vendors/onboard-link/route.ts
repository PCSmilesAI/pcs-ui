import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { loadMap, findVendorKey, setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return json(500, { ok: false, error: 'stripe not configured' });
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

    const body = await req.json().catch(() => ({}));
    const vendorParam: string = (body.vendor || '').trim();
    let accountId: string | undefined = (body.stripeAccountId || '').trim() || undefined;
    if (!vendorParam && !accountId) return json(400, { ok: false, error: 'vendor or stripeAccountId required' });

    if (!accountId) {
      const map = await loadMap();
      // Try to find an existing vendor key by name or alias
      let key = findVendorKey(map, vendorParam) || vendorParam;
      // If the vendor doesn't exist in the map yet, initialize an empty entry
      if (vendorParam && !map.vendors[key]) {
        await setVendorStatus(key, {});
      }
      accountId = map.vendors[key]?.stripeAccountId;
      if (!accountId) {
        // If no account, create a Custom Connect account and persist it
        const acct = await stripe.accounts.create({
          type: 'custom',
          country: 'US',
          capabilities: { transfers: { requested: true } },
        });
        accountId = acct.id;
        await setVendorStatus(key, { stripeAccountId: accountId, ach_status: 'pending' });
      }
    }

    // Prefer Login Link if account has dashboard, else create onboarding Account Link
    let url: string | null = null;
    try {
      const ll = await stripe.accounts.createLoginLink(accountId);
      url = ll.url;
    } catch (_e) {
      const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : '';
      const refreshUrl = `${origin}/VendorsPage`;
      const returnUrl = `${origin}/VendorDetailPage?vendor=${encodeURIComponent(vendorParam || '')}`;
      const al = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: refreshUrl || 'https://example.com',
        return_url: returnUrl || 'https://example.com',
      });
      url = al.url;
    }

    if (!url) return json(500, { ok: false, error: 'failed to create onboarding link' });
    return json(200, { ok: true, url, accountId });
  } catch (err: any) {
    console.error('[VENDOR_ONBOARD_LINK] Error:', err?.message || err);
    return json(500, { ok: false, error: err?.message || 'unknown error' });
  }
}


