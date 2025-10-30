import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readOffices, saveOffices, OfficeInfo } from '../../../../lib/company/officesStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const list = await readOffices();
  return NextResponse.json({ ok: true, offices: list });
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const offices = Array.isArray(body?.offices) ? body.offices as OfficeInfo[] : [];
    // Basic validation and normalisation
    const cleaned: OfficeInfo[] = offices
      .map((o) => ({
        name: String(o?.name || '').trim(),
        address: o?.address ? String(o.address).trim() : undefined,
        manager: o?.manager ? String(o.manager).trim() : undefined,
        email: o?.email ? String(o.email).trim().toLowerCase() : undefined,
      }))
      .filter((o) => o.name.length > 0);
    await saveOffices(cleaned);
    return NextResponse.json({ ok: true, offices: cleaned });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}


