import { NextResponse } from 'next/server';
import { readVendorPayments } from '@/lib/payments/vendorPayments';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await readVendorPayments();
    return NextResponse.json({ vendors: data.vendors }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}


