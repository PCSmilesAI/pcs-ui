/**
 * Filed Documents List API
 * 
 * GET /api/other-documents/filed - Get filed documents with optional type filter
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';

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

    if (documentType) {
      query += ` AND document_type = ?`;
      params.push(documentType);
    }

    query += ` ORDER BY filed_at DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const documents = db.prepare(query).all(...params) as any[];

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM other_documents WHERE status = 'filed'`;
    if (documentType) {
      countQuery += ` AND document_type = ?`;
    }
    const countResult = db.prepare(countQuery).get(...(documentType ? [documentType] : [])) as { total: number };

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
