import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY missing' }, { status: 500 });
    }
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });
    const account = await stripe.accounts.retrieve();
    return NextResponse.json({ ok: true, id: account.id, type: account.type }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'stripe error' }, { status: 500 });
  }
}


