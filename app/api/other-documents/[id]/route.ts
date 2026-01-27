/**
 * Single Document API
 * 
 * GET /api/other-documents/[id] - Get a single document by ID
 * DELETE /api/other-documents/[id] - Delete a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/other-documents/[id]
 * Get a single document by ID
 */
export async function GET(
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

    const document = db.prepare(
      'SELECT * FROM other_documents WHERE id = ?'
    ).get(documentId) as any;

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Parse raw_extracted_data JSON
    const documentWithParsedData = {
      ...document,
      extracted_data: document.raw_extracted_data 
        ? JSON.parse(document.raw_extracted_data) 
        : null
    };

    return NextResponse.json({
      success: true,
      document: documentWithParsedData
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS][GET-ONE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/other-documents/[id]
 * Delete a document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(request);
    const documentId = params.id;

    // Check access - only admin can delete
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDatabase();

    const result = db.prepare('DELETE FROM other_documents WHERE id = ?').run(documentId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    console.log('[API][OTHER-DOCS][DELETE] Deleted document:', documentId, 'by:', user.email);

    return NextResponse.json({
      success: true,
      message: 'Document deleted'
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS][DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
