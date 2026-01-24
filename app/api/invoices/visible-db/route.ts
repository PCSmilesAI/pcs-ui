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
    invoice.vendor_name,
    invoice.source_file,
  ];
  return fields.some((field) => field && normalise(String(field)).includes(q));
}

function matchesVendor(invoice: any, vendor: string): boolean {
  if (!vendor) return true;
  const target = normalise(vendor);
  const compare = normalise(invoice.vendor_name || '');
  return compare.includes(target);
}

function matchesStatus(invoice: any, status: string): boolean {
  if (!status) return true;
  return (invoice.status || '').toLowerCase() === status.toLowerCase();
}

function getOffice(invoice: any): string {
  return (invoice.office_location || invoice.office_id || '').trim();
}

export const dynamic = 'force-dynamic';

/**
 * Database-backed visible invoices endpoint.
 * Reads from SQLite instead of JSON workflow store.
 */
export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  const limit = Number.parseInt(parseSearchParam(req, 'limit', '50'), 10) || 50;
  const offset = Number.parseInt(parseSearchParam(req, 'offset', '0'), 10) || 0;
  const search = parseSearchParam(req, 'search');
  const status = parseSearchParam(req, 'status');
  const vendor = parseSearchParam(req, 'vendor');
  
  console.log('[API][INVOICES][DB]', 'visible_request', { 
    userEmail: user.email, 
    limit, 
    offset, 
    search, 
    status, 
    vendor 
  });

  try {
    const db = getDatabase();
    const [admin, ap] = await Promise.all([isAdmin(user.email), isAP(user.email)]);
    
    let query = 'SELECT * FROM invoices WHERE deleted = 0';
    const params: any[] = [];

    // Role-based filtering
    if (!admin && !ap) {
      const offices = await officesForManager(user.email);
      if (offices.length === 0) {
        console.log('[API][INVOICES][DB]', 'visible_no_offices', { userEmail: user.email });
        return NextResponse.json({ ok: true, count: 0, invoices: [] });
      }
      
      // Only show awaiting_office_approval for managers
      query += ' AND status = ?';
      params.push('awaiting_office_approval');
      
      // Filter by office
      const placeholders = offices.map(() => '?').join(',');
      query += ` AND office_id IN (${placeholders})`;
      params.push(...offices);
    }

    // Sort by newest first (created_at DESC) so most recent invoices appear at the top
    query += ' ORDER BY created_at DESC';
    
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
      matchesSearch(invoice, search) && 
      matchesStatus(invoice, status) && 
      matchesVendor(invoice, vendor)
    );

    // Paginate
    const paginated = filtered.slice(offset, offset + limit);

    // Fetch categories for each invoice
    const getCategoriesStmt = db.prepare(`
      SELECT category_name, class_name, confidence_score, source
      FROM invoice_categories
      WHERE invoice_id = ?
      ORDER BY created_at
      LIMIT 1
    `);

    const paginatedWithCategories = paginated.map(invoice => ({
      ...invoice,
      invoice_categories: getCategoriesStmt.all(invoice.id) as any[]
    }));

    console.log('[API][INVOICES][DB]', 'visible_response', {
      userEmail: user.email,
      total: invoices.length,
      filtered: filtered.length,
      returned: paginatedWithCategories.length,
    });

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      invoices: paginatedWithCategories,
    });
  } catch (err: any) {
    console.error('[API][INVOICES][DB]', 'visible_error', { 
      userEmail: user.email, 
      error: err?.message 
    });
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

