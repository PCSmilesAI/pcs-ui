import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { isAdmin } from '../../../lib/workflow/rolesStore';

export async function GET(req: NextRequest) {
  // SECURITY: Require admin authentication for test endpoint
  const user = getCurrentUser(req);
  const allowed = await isAdmin(user.email);

  if (!allowed) {
    console.warn('[API][TEST] Unauthorized access attempt', { userEmail: user.email });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    url: req.url
  });
}
