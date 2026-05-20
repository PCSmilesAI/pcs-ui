import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin, isAP, getVendorAccessForUser } from '../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../lib/db/client';
import { normalizeVendorName } from '../../../../src/lib/vendorUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    const db = getDatabase();
    const [admin, ap] = await Promise.all([isAdmin(user.email), isAP(user.email)]);

    let query = `
      SELECT COUNT(*) as count FROM invoices
      WHERE status = 'incoming' AND deleted = 0
        AND (parsing_status IN ('failed', 'partial')
             OR vendor_name = 'Unknown'
             OR vendor_name IS NULL
             OR vendor_name = '')
    `;
    const params: any[] = [];

    if (!admin && !ap) {
      const vendorAccess = await getVendorAccessForUser(user.email);

      if (vendorAccess === 'assigned_only') {
        query += ` AND (LOWER(vendor_name) LIKE 'tc dental%' OR LOWER(vendor_name) LIKE 'tc_dental%' OR LOWER(vendor_name) LIKE 'tcdental%')`;
      } else if (Array.isArray(vendorAccess)) {
        if (vendorAccess.length === 0) {
          return NextResponse.json({ count: 0 });
        }
        const vendorConditions: string[] = [];
        for (const vendorName of vendorAccess) {
          const normalized = normalizeVendorName(vendorName);
          if (normalized === 'tc dental lab') {
            vendorConditions.push(`LOWER(vendor_name) LIKE 'tc dental%'`);
            vendorConditions.push(`LOWER(vendor_name) LIKE 'tc_dental%'`);
            vendorConditions.push(`LOWER(vendor_name) LIKE 'tcdental%'`);
          } else {
            vendorConditions.push(`LOWER(REPLACE(REPLACE(vendor_name, '_', ' '), '  ', ' ')) = ?`);
            params.push(normalized);
          }
        }
        query += ` AND (${vendorConditions.join(' OR ')})`;
      }
      // vendorAccess === '*' → full access, no extra filter
    }

    const row = db.prepare(query).get(...params) as { count: number };
    return NextResponse.json({ count: row?.count || 0 });
  } catch (err: any) {
    console.error('[INCOMING_COUNT] Error:', err?.message);
    return NextResponse.json({ count: 0 });
  }
}
