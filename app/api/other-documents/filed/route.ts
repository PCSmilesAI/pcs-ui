/**
 * Filed Documents List API
 * 
 * GET /api/other-documents/filed - Get filed documents with optional type filter
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

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '500', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get vendor access for this user
    const vendorAccess = await getVendorAccessForUser(user.email);

    const db = getDatabase();

    // Build query based on filters
    let query = `
      SELECT 
        id,
        vendor_name,
        document_type,
        document_date,
        pdf_path,
        user_note,
        filed_at,
        filed_by,
        created_at,
        updated_at
      FROM other_documents
      WHERE status = 'filed'
    `;
    const params: any[] = [];

    // Apply vendor_access filtering
    if (vendorAccess === '*') {
      // Full access - no vendor filter
    } else if (Array.isArray(vendorAccess)) {
      const vendorPlaceholders = vendorAccess.map(() => 'LOWER(vendor_name) LIKE ?').join(' OR ');
      const vendorParams = vendorAccess.map(v => `%${v.toLowerCase()}%`);
      query += ` AND (${vendorPlaceholders} OR LOWER(filed_by) = ?)`;
      params.push(...vendorParams, user.email.toLowerCase());
    } else if (vendorAccess === 'assigned_only') {
      query += ` AND (LOWER(vendor_name) LIKE '%tc dental%' OR LOWER(filed_by) = ?)`;
      params.push(user.email.toLowerCase());
    }

    if (documentType) {
      query += ` AND document_type = ?`;
      params.push(documentType);
    }

    query += ` ORDER BY filed_at DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const documents = db.prepare(query).all(...params) as any[];

    // Get total count for pagination (with same vendor filter)
    let countQuery = `SELECT COUNT(*) as total FROM other_documents WHERE status = 'filed'`;
    const countParams: any[] = [];
    if (vendorAccess === '*') {
      // no filter
    } else if (Array.isArray(vendorAccess)) {
      const vendorPlaceholders = vendorAccess.map(() => 'LOWER(vendor_name) LIKE ?').join(' OR ');
      const vendorParams = vendorAccess.map(v => `%${v.toLowerCase()}%`);
      countQuery += ` AND (${vendorPlaceholders} OR LOWER(filed_by) = ?)`;
      countParams.push(...vendorParams, user.email.toLowerCase());
    } else if (vendorAccess === 'assigned_only') {
      countQuery += ` AND (LOWER(vendor_name) LIKE '%tc dental%' OR LOWER(filed_by) = ?)`;
      countParams.push(user.email.toLowerCase());
    }
    if (documentType) {
      countQuery += ` AND document_type = ?`;
      countParams.push(documentType);
    }
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };

    return NextResponse.json({
      success: true,
      documents,
      pagination: {
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + documents.length < countResult.total
      }
    });

  } catch (error: any) {
    console.error('[API][FILED-DOCS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
