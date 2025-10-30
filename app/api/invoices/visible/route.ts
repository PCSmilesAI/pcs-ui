import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin, isAP, officesForManager } from '../../../../lib/workflow/rolesStore';
import { listVisibleFor } from '../../../../lib/workflow/invoiceStore';

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
  console.log('[API][INVOICES]', 'visible_request', { userEmail: user.email });

  const [admin, ap] = await Promise.all([isAdmin(user.email), isAP(user.email)]);
  let invoices: any[] = [];

  if (admin || ap) {
    invoices = await listVisibleFor();
  } else {
    const offices = await officesForManager(user.email);
    if (offices.length === 0) {
      console.log('[API][INVOICES]', 'visible_no_offices', { userEmail: user.email });
      return NextResponse.json({ ok: true, count: 0, invoices: [] });
    }
    const officeSet = new Set(offices.map((o) => o.toLowerCase()));
    invoices = await listVisibleFor((invoice) => {
      const status = (invoice.status || '').toLowerCase();
      if (status !== 'awaiting_office_approval') return false;
      const office = getOffice(invoice).toLowerCase();
      return (!!office) && officeSet.has(office);
    });
  }

  const limit = Number.parseInt(parseSearchParam(req, 'limit', '50'), 10) || 50;
  const offset = Number.parseInt(parseSearchParam(req, 'offset', '0'), 10) || 0;
  const search = parseSearchParam(req, 'search');
  const status = parseSearchParam(req, 'status');
  const vendor = parseSearchParam(req, 'vendor');

  const filtered = invoices.filter((invoice) =>
    matchesSearch(invoice, search) && matchesStatus(invoice, status) && matchesVendor(invoice, vendor)
  );

  const paginated = filtered.slice(offset, offset + limit);
  console.log('[API][INVOICES]', 'visible_response', {
    userEmail: user.email,
    total: invoices.length,
    returned: paginated.length,
  });

  return NextResponse.json({
    ok: true,
    count: filtered.length,
    invoices: paginated,
  });
}
