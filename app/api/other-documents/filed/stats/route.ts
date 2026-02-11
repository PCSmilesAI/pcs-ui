/**
 * Filed Documents Stats API
 * 
 * GET /api/other-documents/filed/stats - Get counts of filed documents by type
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP, getVendorAccessForUser } from '@/lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);

    // Check access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get vendor access for this user
    const vendorAccess = await getVendorAccessForUser(user.email);

    const db = getDatabase();

    // Build vendor filter clause
    let vendorFilter = '';
    const vendorParams: any[] = [];
    if (vendorAccess === '*') {
      // Full access - no vendor filter
    } else if (Array.isArray(vendorAccess)) {
      const vendorPlaceholders = vendorAccess.map(() => 'LOWER(vendor_name) LIKE ?').join(' OR ');
      const vParams = vendorAccess.map(v => `%${v.toLowerCase()}%`);
      vendorFilter = ` AND (${vendorPlaceholders} OR LOWER(filed_by) = ?)`;
      vendorParams.push(...vParams, user.email.toLowerCase());
    } else if (vendorAccess === 'assigned_only') {
      vendorFilter = ` AND (LOWER(vendor_name) LIKE '%tc dental%' OR LOWER(filed_by) = ?)`;
      vendorParams.push(user.email.toLowerCase());
    }

    // Get counts by document type for filed documents only
    const typeCounts = db.prepare(`
      SELECT 
        document_type as type,
        COUNT(*) as count
      FROM other_documents
      WHERE status = 'filed'${vendorFilter}
      GROUP BY document_type
      ORDER BY count DESC
    `).all(...vendorParams) as Array<{ type: string; count: number }>;

    // Get total filed count
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM other_documents WHERE status = 'filed'${vendorFilter}
    `).get(...vendorParams) as { total: number };

    return NextResponse.json({
      success: true,
      typeCounts,
      totalFiled: totalResult.total
    });

  } catch (error: any) {
    console.error('[API][FILED-STATS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
