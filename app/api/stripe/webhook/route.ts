import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';

export async function POST(request: Request) {
  const sig = (await headers()).get('stripe-signature') || '';
  const whSecret = process.env.PCS_STRIPE_WEBHOOK_SECRET;
  if (!whSecret) return NextResponse.json({ ok: false, error: 'Webhook secret missing' }, { status: 500 });

  const raw = await request.text();

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Invalid signature: ${err.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, type: evt.type }, { status: 200 });
}


