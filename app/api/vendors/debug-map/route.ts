import { NextResponse } from 'next/server';
import { loadMap } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const map = await loadMap();
  return NextResponse.json(map, { status: 200 });
}




