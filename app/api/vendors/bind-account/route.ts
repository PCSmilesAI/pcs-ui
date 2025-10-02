import { NextResponse } from 'next/server';
import { setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vendor = String(body?.vendor || '').trim();
    const stripeAccountId = String(body?.stripeAccountId || '').trim();
    if (!vendor || !stripeAccountId) {
      return NextResponse.json({ ok: false, error: 'vendor and stripeAccountId required' }, { status: 400 });
    }
    await setVendorStatus(vendor, { stripeAccountId });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'error' }, { status: 500 });
  }
}


