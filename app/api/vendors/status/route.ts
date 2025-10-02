import { NextResponse } from 'next/server';
import { getVendors } from '@/lib/payments/vendorStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vendors = await getVendors();
  return NextResponse.json({ vendors }, { status: 200 });
}


