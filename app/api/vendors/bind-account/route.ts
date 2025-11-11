import { NextResponse } from 'next/server';
import { setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vendor = String(body?.vendor || body?.vendorName || '').trim();
    const stripeAccountId = String(body?.stripeAccountId || '').trim();
    const aliases = Array.isArray(body?.aliases) ? body.aliases : undefined;
    if (!vendor || !stripeAccountId) {
      return NextResponse.json({ ok: false, error: 'vendor and stripeAccountId required' }, { status: 400 });
    }
    await setVendorStatus(vendor, { stripeAccountId, ...(aliases ? { aliases } : {}) });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[API][VENDORS][BIND-ACCOUNT]', 'error', { error: err?.message });
    // Return safe error message to client
    return NextResponse.json({ ok: false, error: 'Failed to bind account' }, { status: 500 });
  }
}


