import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { listDeleted } from '../../../../lib/workflow/invoiceStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  console.log('[API][INVOICES]', 'deleted_request', { userEmail: user.email });
  if (!(await isAdmin(user.email))) {
    console.log('[API][INVOICES]', 'deleted_unauthorized', { userEmail: user.email });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const invoices = await listDeleted();
  console.log('[API][INVOICES]', 'deleted_response', { userEmail: user.email, returned: invoices.length });
  return NextResponse.json({ ok: true, count: invoices.length, invoices });
}
