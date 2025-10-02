import { NextResponse } from 'next/server';
import { loadVendorMap } from '@/lib/payments/vendorStripeStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { map, path } = await loadVendorMap();
  // eslint-disable-next-line no-console
  console.log('[VENDOR_STATUS] GET', { path, count: Object.keys(map.vendors).length });
  return NextResponse.json(map, { status: 200 });
}


