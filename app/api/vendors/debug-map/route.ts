import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { loadMap } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // SECURITY: Require admin authentication for debug endpoint
  const user = getCurrentUser(req);
  const allowed = await isAdmin(user.email);

  if (!allowed) {
    console.warn('[API][VENDORS][DEBUG-MAP] Unauthorized access attempt', { userEmail: user.email });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const map = await loadMap();
  return NextResponse.json(map, { status: 200 });
}




