import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin, isAP, officesForManager, getVendorAccessForUser, VendorAccess } from '../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../lib/db/client';
import { normalizeVendorName } from '../../../../src/lib/vendorUtils';

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

function matchesAttachment(invoice: any, hasAttachment: string): boolean {
  if (!hasAttachment) return true;
  const pdfPath = invoice.pdf_path || invoice.pdfPath || '';
  const hasPdf = !!(pdfPath && pdfPath.trim() !== '');
  if (hasAttachment === 'yes') return hasPdf;
  if (hasAttachment === 'no') return !hasPdf;
  return true;
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
  const hasAttachment = parseSearchParam(req, 'hasAttachment');
  console.log('[API][INVOICES]', 'visible_request', { userEmail: user.email, limit, offset, search, status, vendor, hasAttachment });

  try {
    const db = getDatabase();
    const [admin, ap] = await Promise.all([isAdmin(user.email), isAP(user.email)]);

    // Check if current_assigned_user_email column exists
    let hasReassignmentColumn = false;
    try {
      const columns = db.prepare(`PRAGMA table_info(invoices)`).all() as any[];
      hasReassignmentColumn = columns.some(col => col.name === 'current_assigned_user_email');
    } catch (e) {
      console.warn('[API][INVOICES]', 'Could not check for reassignment column:', e);
    }

    let query = 'SELECT * FROM invoices WHERE deleted = 0';
    const params: any[] = [];

    // NEW: Check for invoices assigned to current user (reassignment feature)
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // Get vendor access configuration for this user
    const vendorAccess = await getVendorAccessForUser(user.email);
    console.log('[API][INVOICES]', 'vendor_access_check', { userEmail: user.email, vendorAccess });

    // Apply vendor-based filtering based on user's vendor_access configuration
    if (vendorAccess === 'assigned_only') {
      // User only sees invoices explicitly assigned to them
      // EXCEPT: For to_be_paid and completed/paid statuses, also show TC Dental invoices
      // (shared visibility between McKay and Laura for payment workflow)
      // TC Dental variations: "TC Dental", "TC Dental Lab", "TC Dental Laboratory, Inc.", etc.
      const tcDentalPattern = `(LOWER(vendor_name) LIKE 'tc dental%' OR LOWER(vendor_name) LIKE 'tc_dental%' OR LOWER(vendor_name) LIKE 'tcdental%')`;
      
      if (hasReassignmentColumn) {
        query += ` AND (
          LOWER(current_assigned_user_email) = ?
          OR (
            status IN ('to_be_paid', 'paid', 'completed') 
            AND ${tcDentalPattern}
          )
        )`;
        params.push(normalizedUserEmail);
      } else {
        // No reassignment column - only show to_be_paid/completed TC Dental invoices
        query += ` AND (
          status IN ('to_be_paid', 'paid', 'completed') 
          AND ${tcDentalPattern}
        )`;
      }
    } else if (Array.isArray(vendorAccess)) {
      // User only sees invoices from specific vendors (e.g., TC Dental Lab)
      // Build SQL conditions that match all variations of vendor names
      
      if (vendorAccess.length === 0) {
        return NextResponse.json({ ok: true, count: 0, invoices: [] });
      }
      
      // Build OR conditions for each vendor, using LIKE patterns for vendors with known variations
      const vendorConditions: string[] = [];
      
      for (const vendorName of vendorAccess) {
        const normalized = normalizeVendorName(vendorName);
        
        // TC Dental Lab has many variations: "TC Dental", "TC Dental Lab", "TC Dental Laboratory, Inc.", etc.
        if (normalized === 'tc dental lab') {
          // Match any vendor name starting with "tc dental" (case-insensitive)
          vendorConditions.push(`LOWER(vendor_name) LIKE 'tc dental%'`);
          vendorConditions.push(`LOWER(vendor_name) LIKE 'tc_dental%'`);
          vendorConditions.push(`LOWER(vendor_name) LIKE 'tcdental%'`);
        } else {
          // For other vendors, use exact match on normalized name
          vendorConditions.push(`LOWER(REPLACE(REPLACE(vendor_name, '_', ' '), '  ', ' ')) = ?`);
          params.push(normalized);
        }
      }
      
      query += ` AND (${vendorConditions.join(' OR ')})`;
    } else {
      // vendorAccess === '*' - Full access (developer account)
      // Role-based filtering for admins/AP
      if (!admin && !ap) {
        const offices = await officesForManager(user.email);
        if (offices.length === 0) {
          console.log('[API][INVOICES]', 'visible_no_offices', { userEmail: user.email });
          return NextResponse.json({ ok: true, count: 0, invoices: [] });
        }

        // Show invoices either:
        // 1. Assigned to this user via reassignment (if column exists), OR
        // 2. In awaiting_office_approval status for their offices
        if (hasReassignmentColumn) {
          query += ` AND (
            LOWER(current_assigned_user_email) = ? OR
            (status = ? AND office_id IN (${offices.map(() => '?').join(',')}))
          )`;
          params.push(normalizedUserEmail, 'awaiting_office_approval', ...offices);
        } else {
          // Fallback: just use status and office filtering
          query += ` AND status = ? AND office_id IN (${offices.map(() => '?').join(',')})`;
          params.push('awaiting_office_approval', ...offices);
        }
      }
      // For admins with full access (*), show all invoices (no additional filtering)
    }

    // Add ORDER BY to get most recent invoices first
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
      matchesSearch(invoice, search) && matchesStatus(invoice, status) && matchesVendor(invoice, vendor) && matchesAttachment(invoice, hasAttachment)
    );

    // Paginate
    const paginated = filtered.slice(offset, offset + limit);

    // Fetch categories for each invoice
    const getCategoriesStmt = db.prepare(`
      SELECT category_name, class_name, confidence_score, source
      FROM invoice_categories
      WHERE invoice_id = ?
      ORDER BY sequence ASC, created_at ASC
    `);
    
    // Fetch all distinct locations (class names) for each invoice
    const getLocationsStmt = db.prepare(`
      SELECT DISTINCT class_name
      FROM invoice_categories
      WHERE invoice_id = ? AND class_name IS NOT NULL AND class_name != ''
      ORDER BY sequence ASC
    `);
    
    // Fetch template name if a coding template was applied
    const getTemplateStmt = db.prepare(`
      SELECT name FROM coding_templates WHERE id = ?
    `);

    const paginatedWithCategories = paginated.map(invoice => {
      const categories = getCategoriesStmt.all(invoice.id) as any[];
      const locationRows = getLocationsStmt.all(invoice.id) as { class_name: string }[];
      const locations = locationRows.map(r => r.class_name);
      
      // Get template name if template was applied
      let applied_template_name: string | null = null;
      if (invoice.coding_template_id) {
        const template = getTemplateStmt.get(invoice.coding_template_id) as { name: string } | undefined;
        applied_template_name = template?.name || null;
      }
      
      return {
        ...invoice,
        invoice_categories: categories,
        locations: locations, // Array of all class names from GL Lines
        applied_template_name, // Name of coding template if used
      };
    });

    console.log('[API][INVOICES]', 'visible_response', {
      userEmail: user.email,
      total: invoices.length,
      filtered: filtered.length,
      returned: paginatedWithCategories.length,
    });

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      invoices: paginatedWithCategories,
      vendorAccess: vendorAccess, // Include vendor access config for frontend
      userEmail: user.email,
    });
  } catch (err: any) {
    console.error('[API][INVOICES]', 'visible_error', { userEmail: user.email, error: err?.message, stack: err?.stack });
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
