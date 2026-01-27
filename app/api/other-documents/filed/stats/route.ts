/**
 * Filed Documents Stats API
 * 
 * GET /api/other-documents/filed/stats - Get counts of filed documents by type
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

    const db = getDatabase();

    // Get counts by document type for filed documents only
    const typeCounts = db.prepare(`
      SELECT 
        document_type as type,
        COUNT(*) as count
      FROM other_documents
      WHERE status = 'filed'
      GROUP BY document_type
      ORDER BY count DESC
    `).all() as Array<{ type: string; count: number }>;

    // Get total filed count
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM other_documents WHERE status = 'filed'
    `).get() as { total: number };

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
