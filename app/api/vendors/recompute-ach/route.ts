import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { loadMap, saveMap } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST() {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return json(500, { ok: false, error: 'stripe not configured' });
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

    const map = await loadMap();
    let updated = 0;
    for (const [name, entry] of Object.entries(map.vendors)) {
      if (!entry.stripeAccountId) continue;
      try {
        const acct = await stripe.accounts.retrieve(entry.stripeAccountId);
        const count = (typeof (acct as any)?.external_accounts?.total_count === 'number')
          ? (acct as any).external_accounts.total_count
          : 0;
        const active = (acct.capabilities as any)?.transfers === 'active';
        const ach: 'complete' | 'pending' | 'missing' = active && count > 0 ? 'complete' : (active || count > 0) ? 'pending' : 'missing';
        if (entry.ach_status !== ach) {
          entry.ach_status = ach;
          updated += 1;
        }
      } catch (e: any) {
        console.warn('[RECOMPUTE][ACH] failed for', name, e?.message);
      }
    }
    if (updated > 0) await saveMap(map);
    return json(200, { ok: true, updated });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[RECOMPUTE][ACH] Error:', err?.message || err);
    // Return safe error message to client
    return json(500, { ok: false, error: 'Failed to recompute ACH status' });
  }
}


