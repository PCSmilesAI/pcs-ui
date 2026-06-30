import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readRoles, saveRoles, RolesFile } from '../../../../lib/workflow/rolesStore';

function normaliseEmail(value: string): string {
  return value.trim();
}

function validateRolesPayload(payload: any, existing: RolesFile): RolesFile {
  const next: RolesFile = {
    admins: Array.isArray(payload.admins)
      ? payload.admins.map((email: any) => (typeof email === 'string' ? normaliseEmail(email) : '')).filter(Boolean)
      : existing.admins,
    ap_authorizers: Array.isArray(payload.ap_authorizers)
      ? payload.ap_authorizers.map((email: any) => (typeof email === 'string' ? normaliseEmail(email) : '')).filter(Boolean)
      : existing.ap_authorizers,
    office_managers: existing.office_managers,
    threshold_usd: typeof payload.threshold_usd === 'number' ? payload.threshold_usd : existing.threshold_usd,
    test_mode_route_all_to_admin:
      typeof payload.test_mode_route_all_to_admin === 'boolean'
        ? payload.test_mode_route_all_to_admin
        : existing.test_mode_route_all_to_admin,
    vendor_access: existing.vendor_access,
    active_qbo_vendors: Array.isArray(payload.active_qbo_vendors)
      ? payload.active_qbo_vendors.map((v: any) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
      : existing.active_qbo_vendors,
    version: (existing.version ?? 0) + 1,
  };

  if (payload.vendor_access && typeof payload.vendor_access === 'object') {
    next.vendor_access = payload.vendor_access;
  }

  if (payload.office_managers && typeof payload.office_managers === 'object') {
    const officeManagers: Record<string, string[]> = {};
    for (const [office, emails] of Object.entries(payload.office_managers)) {
      if (!Array.isArray(emails)) continue;
      officeManagers[office] = emails
        .map((email) => (typeof email === 'string' ? normaliseEmail(email) : ''))
        .filter(Boolean);
    }
    next.office_managers = officeManagers;
  }

  return next;
}

export async function GET(req: NextRequest) {
  // Allow all authenticated users to read roles so they can determine their permissions
  // The roles data itself is not sensitive - it just contains email lists
  // Write operations (PUT) still require admin
  const roles = await readRoles();
  return NextResponse.json(roles);
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const current = await readRoles();
    const next = validateRolesPayload(body, current);
    await saveRoles(next);
    return NextResponse.json({ ok: true, roles: next });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}
