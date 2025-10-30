import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getThreshold, setThreshold } from '../../../../lib/workflow/rolesStore';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const admin_threshold_usd = await getThreshold();
  return NextResponse.json({ ok: true, admin_threshold_usd });
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const value = body?.admin_threshold_usd;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: 'admin_threshold_usd must be a positive number' }, { status: 400 });
    }
    await setThreshold(value);
    return NextResponse.json({ ok: true, admin_threshold_usd: await getThreshold() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}
