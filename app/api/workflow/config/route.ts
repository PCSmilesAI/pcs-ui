import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getThreshold, setThreshold, readRoles } from '../../../../lib/workflow/rolesStore';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  // Allow all authenticated users to read config (needed for vendor_access check)
  const admin_threshold_usd = await getThreshold();
  const roles = await readRoles();
  
  return NextResponse.json({ 
    ok: true, 
    admin_threshold_usd,
    admins: roles.admins || [],
    vendor_access: roles.vendor_access || {},
  });
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
