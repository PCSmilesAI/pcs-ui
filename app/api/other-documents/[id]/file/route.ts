/**
 * File Document API
 * 
 * POST /api/other-documents/[id]/file - Mark a document as filed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/other-documents/[id]/file
 * Mark a document as filed with timestamp and user info
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(request);
    const documentId = params.id;

    // Check access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if document exists
    const document = db.prepare('SELECT id, status FROM other_documents WHERE id = ?').get(documentId) as any;
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check if already filed
    if (document.status === 'filed') {
      return NextResponse.json({ error: 'Document is already filed' }, { status: 400 });
    }

    // Update document to filed status
    const result = db.prepare(`
      UPDATE other_documents 
      SET status = 'filed',
          filed_at = ?,
          filed_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, user.email, now, documentId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Failed to file document' }, { status: 500 });
    }

    console.log('[API][OTHER-DOCS][FILE] Document filed:', documentId, 'by:', user.email);

    return NextResponse.json({
      success: true,
      message: 'Document filed successfully',
      filed_at: now,
      filed_by: user.email
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS][FILE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
