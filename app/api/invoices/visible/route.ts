import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin, isAP, officesForManager } from '../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../lib/db/client';

function parseSearchParam(req: NextRequest, key: string, fallback = ''): string {
  return (req.nextUrl.searchParams.get(key) || fallback).trim();
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearch(invoice: any, query: string): boolean {
  if (!query) return true;
  const q = normalise(query);
  const fields = [
    invoice.invoice_number,
    invoice.vendor,
    invoice.vendor_name,
    invoice.invoice,
    invoice.source_file,
  ];
  return fields.some((field) => field && normalise(String(field)).includes(q));
}

function matchesVendor(invoice: any, vendor: string): boolean {
  if (!vendor) return true;
  const target = normalise(vendor);
  const compare = normalise(invoice.vendor_name || invoice.vendor || '');
  return compare.includes(target);
}

function matchesStatus(invoice: any, status: string): boolean {
  if (!status) return true;
  return (invoice.status || '').toLowerCase() === status.toLowerCase();
}

function getOffice(invoice: any): string {
  return (invoice.office_location || invoice.office || invoice.clinic_id || '').trim();
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  const limit = Number.parseInt(parseSearchParam(req, 'limit', '50'), 10) || 50;
  const offset = Number.parseInt(parseSearchParam(req, 'offset', '0'), 10) || 0;
  const search = parseSearchParam(req, 'search');
  const status = parseSearchParam(req, 'status');
  const vendor = parseSearchParam(req, 'vendor');
  console.log('[API][INVOICES]', 'visible_request', { userEmail: user.email, limit, offset, search, status, vendor });

  try {
    const db = getDatabase();
    const [admin, ap] = await Promise.all([isAdmin(user.email), isAP(user.email)]);

    let query = 'SELECT * FROM invoices WHERE deleted = 0';
    const params: any[] = [];

    // NEW: Check for invoices assigned to current user (reassignment feature)
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // Role-based filtering
    if (!admin && !ap) {
      const offices = await officesForManager(user.email);
      if (offices.length === 0) {
        console.log('[API][INVOICES]', 'visible_no_offices', { userEmail: user.email });
        return NextResponse.json({ ok: true, count: 0, invoices: [] });
      }

      // Show invoices either:
      // 1. Assigned to this user via reassignment, OR
      // 2. In awaiting_office_approval status for their offices
      query += ` AND (
        LOWER(current_assigned_user_email) = ? OR
        (status = ? AND office_id IN (${offices.map(() => '?').join(',')}))
      )`;
      params.push(normalizedUserEmail, 'awaiting_office_approval', ...offices);
    } else {
      // For admins and AP managers, also show invoices assigned to them
      query += ` AND (
        LOWER(current_assigned_user_email) = ? OR
        current_assigned_user_email IS NULL
      )`;
      params.push(normalizedUserEmail);
    }

    // Get all matching invoices
    const allInvoices = db.prepare(query).all(...params) as any[];

    // Parse JSON fields
    const invoices = allInvoices.map(inv => ({
      ...inv,
      field_locks: inv.field_locks ? JSON.parse(inv.field_locks) : {},
      approvals: inv.approvals ? JSON.parse(inv.approvals) : {},
    }));

    // Apply filters
    const filtered = invoices.filter((invoice) =>
      matchesSearch(invoice, search) && matchesStatus(invoice, status) && matchesVendor(invoice, vendor)
    );

    // Paginate
    const paginated = filtered.slice(offset, offset + limit);
    console.log('[API][INVOICES]', 'visible_response', {
      userEmail: user.email,
      total: invoices.length,
      filtered: filtered.length,
      returned: paginated.length,
    });

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      invoices: paginated,
    });
  } catch (err: any) {
    console.error('[API][INVOICES]', 'visible_error', { userEmail: user.email, error: err?.message, stack: err?.stack });
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
