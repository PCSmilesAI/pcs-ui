import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      // Log full error server-side only
      console.warn('[STRIPE][PING] Missing STRIPE_SECRET_KEY');
      // Return safe error message to client
      return NextResponse.json({ ok: false, error: 'Stripe not configured' }, { status: 500 });
    }
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });
    const account = await stripe.accounts.retrieve();
    return NextResponse.json({ ok: true, id: account.id, type: account.type }, { status: 200 });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[STRIPE][PING]', 'error', { error: err?.message });
    // Return safe error message to client
    return NextResponse.json({ ok: false, error: 'Stripe ping failed' }, { status: 500 });
  }
}


