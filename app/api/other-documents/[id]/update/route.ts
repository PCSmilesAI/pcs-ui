/**
 * Update Document API
 * 
 * POST /api/other-documents/[id]/update - Update document details
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/other-documents/[id]/update
 * Update document details (vendor, date, user note)
 * 
 * Body:
 * {
 *   vendor_name?: string,
 *   document_date?: string,
 *   user_note?: string
 * }
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

    const body = await request.json();
    const { vendor_name, document_date, user_note } = body;

    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if document exists
    const document = db.prepare('SELECT id FROM other_documents WHERE id = ?').get(documentId) as any;
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Build update query dynamically
    const updates: string[] = ['updated_at = ?'];
    const params_: any[] = [now];

    if (vendor_name !== undefined) {
      updates.push('vendor_name = ?');
      params_.push(vendor_name || null);
    }

    if (document_date !== undefined) {
      updates.push('document_date = ?');
      params_.push(document_date || null);
    }

    if (user_note !== undefined) {
      updates.push('user_note = ?');
      params_.push(user_note || null);
    }

    // Add document ID to params
    params_.push(documentId);

    // Execute update
    const result = db.prepare(`
      UPDATE other_documents 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params_);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    // Fetch updated document
    const updatedDocument = db.prepare('SELECT * FROM other_documents WHERE id = ?').get(documentId) as any;

    console.log('[API][OTHER-DOCS][UPDATE] Document updated:', documentId, 'by:', user.email);

    return NextResponse.json({
      success: true,
      message: 'Document updated successfully',
      document: updatedDocument
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS][UPDATE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
