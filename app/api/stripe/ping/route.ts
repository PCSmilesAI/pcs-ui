import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';

export async function GET() {
  try {
    const account = await stripe.accounts.retrieve();
    return NextResponse.json({ ok: true, id: account.id, type: account.type }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'stripe error' }, { status: 500 });
  }
}


