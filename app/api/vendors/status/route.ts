import { NextResponse } from 'next/server';
import { getVendors, getMapPath, loadMap } from '@/lib/payments/vendorStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vendors = await getVendors();
  const map = await loadMap();
  const path = getMapPath();
  return NextResponse.json({ vendors, version: map.version ?? 0, path }, { status: 200 });
}


