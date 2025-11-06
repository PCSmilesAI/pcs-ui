import { NextResponse } from 'next/server';
import { getVendors, getMapPath, loadMap } from '@/lib/payments/vendorStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vendors = await getVendors();
  const map = await loadMap();
  const path = getMapPath();

  // Return vendors with cached ACH status (don't compute fresh status here to avoid timeouts)
  // Fresh status is computed on-demand in /api/vendors/ach-info endpoint
  return NextResponse.json({ vendors, version: map.version ?? 0, path }, { status: 200 });
}


