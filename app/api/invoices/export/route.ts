import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../lib/db/client';
import { isAdmin } from '../../../../lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);

  try {
    // Check admin permission
    const userIsAdmin = await isAdmin(user.email);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const db = getDatabase();
    
    // Get all invoices with all fields
    const invoices = db.prepare(`
      SELECT
        id,
        invoice_number,
        source_file,
        source_message_id,
        parsed_vendor_name,
        parsed_office_id,
        parsed_amount_cents,
        corrected_vendor_name,
        corrected_office_id,
        corrected_amount_cents,
        vendor_name,
        office_id,
        amount_cents,
        field_locks,
        status,
        approvals,
        deleted,
        workflow_deleted_at,
        status_version,
        created_at,
        updated_at,
        invoice_date,
        due_date,
        description,
        category,
        clinic_id,
        office_location,
        vendor_id,
        pdf_path,
        total,
        invoice_total
      FROM invoices
      ORDER BY created_at DESC
    `).all();

    // Parse JSON fields
    const result = invoices.map((inv: any) => ({
      ...inv,
      field_locks: inv.field_locks ? JSON.parse(inv.field_locks) : null,
      approvals: inv.approvals ? JSON.parse(inv.approvals) : null,
    }));

    console.log('[API][INVOICES][EXPORT]', 'success', { userEmail: user.email, count: result.length });
    
    return NextResponse.json({
      ok: true,
      count: result.length,
      invoices: result,
    });
  } catch (err: any) {
    console.error('[API][INVOICES][EXPORT]', 'error', { error: err?.message });
    return NextResponse.json({ error: err?.message || 'Export failed' }, { status: 400 });
  }
}

