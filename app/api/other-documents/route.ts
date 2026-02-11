/**
 * Other Documents API
 * 
 * CRUD operations for non-invoice documents (credit memos, statements, etc.)
 * 
 * GET /api/other-documents - List documents with filtering
 * POST /api/other-documents - Create a new document record
 * PUT /api/other-documents - Update document status/notes
 * DELETE /api/other-documents - Archive/delete a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP, getVendorAccessForUser } from '@/lib/workflow/rolesStore';
import { v4 as uuidv4 } from 'uuid';
import { type DocumentType } from '@/lib/gpt/documentClassifier';

export const dynamic = 'force-dynamic';

interface OtherDocument {
  id: string;
  document_type: DocumentType;
  vendor_name: string | null;
  amount: number | null;
  document_date: string | null;
  reference_number: string | null;
  pdf_path: string | null;
  source_email_id: string | null;
  email_subject: string | null;
  email_from: string | null;
  classification_confidence: number | null;
  raw_extracted_data: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/other-documents
 * List documents with optional filtering
 * 
 * Query params:
 * - type: Filter by document_type
 * - status: Filter by status (pending, reviewed, applied, archived)
 * - vendor: Filter by vendor name (partial match)
 * - limit: Max results (default 100)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    
    // Check access - admin or AP users
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('type');
    const status = searchParams.get('status');
    const vendor = searchParams.get('vendor');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get vendor access for this user
    const vendorAccess = await getVendorAccessForUser(user.email);

    const db = getDatabase();

    // Build query with filters
    let query = 'SELECT * FROM other_documents WHERE 1=1';
    const params: any[] = [];

    // Apply vendor_access filtering
    if (vendorAccess === '*') {
      // Full access - no vendor filter needed
    } else if (Array.isArray(vendorAccess)) {
      // Specific vendor list (e.g., Laura sees TC Dental Lab docs + anything she filed)
      const vendorPlaceholders = vendorAccess.map(() => 'LOWER(vendor_name) LIKE ?').join(' OR ');
      const vendorParams = vendorAccess.map(v => `%${v.toLowerCase()}%`);
      query += ` AND (${vendorPlaceholders} OR LOWER(filed_by) = ?)`;
      params.push(...vendorParams, user.email.toLowerCase());
      console.log('[API][OTHER-DOCS] Vendor access filter applied:', { user: user.email, vendors: vendorAccess });
    } else if (vendorAccess === 'assigned_only') {
      // McKay: show TC Dental docs (active vendor) + anything he filed
      query += ` AND (LOWER(vendor_name) LIKE '%tc dental%' OR LOWER(filed_by) = ?)`;
      params.push(user.email.toLowerCase());
      console.log('[API][OTHER-DOCS] Assigned-only filter applied (TC Dental + own):', { user: user.email });
    }

    if (documentType) {
      query += ' AND document_type = ?';
      params.push(documentType);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (vendor) {
      query += ' AND vendor_name LIKE ?';
      params.push(`%${vendor}%`);
    }

    // Get total count for pagination
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = db.prepare(countQuery).get(...params) as { count: number };

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const documents = db.prepare(query).all(...params) as OtherDocument[];

    // Parse raw_extracted_data JSON for each document
    const documentsWithParsedData = documents.map(doc => ({
      ...doc,
      extracted_data: doc.raw_extracted_data ? JSON.parse(doc.raw_extracted_data) : null
    }));

    // Build vendor filter clause for stats (same logic as main query)
    let statsVendorFilter = '';
    const statsVendorParams: any[] = [];
    if (vendorAccess === '*') {
      // Full access - no filter
    } else if (Array.isArray(vendorAccess)) {
      const vendorPlaceholders = vendorAccess.map(() => 'LOWER(vendor_name) LIKE ?').join(' OR ');
      const vParams = vendorAccess.map(v => `%${v.toLowerCase()}%`);
      statsVendorFilter = ` WHERE (${vendorPlaceholders} OR LOWER(filed_by) = ?)`;
      statsVendorParams.push(...vParams, user.email.toLowerCase());
    } else if (vendorAccess === 'assigned_only') {
      statsVendorFilter = ` WHERE (LOWER(vendor_name) LIKE '%tc dental%' OR LOWER(filed_by) = ?)`;
      statsVendorParams.push(user.email.toLowerCase());
    }

    // Get stats by type (filtered by vendor access)
    const typeStats = db.prepare(`
      SELECT document_type, COUNT(*) as count 
      FROM other_documents${statsVendorFilter}
      GROUP BY document_type
    `).all(...statsVendorParams) as Array<{ document_type: string; count: number }>;

    // Get stats by status (filtered by vendor access)
    const statusStats = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM other_documents${statsVendorFilter}
      GROUP BY status
    `).all(...statsVendorParams) as Array<{ status: string; count: number }>;

    return NextResponse.json({
      success: true,
      documents: documentsWithParsedData,
      pagination: {
        total: countResult.count,
        limit,
        offset,
        hasMore: offset + documents.length < countResult.count
      },
      stats: {
        byType: Object.fromEntries(typeStats.map(s => [s.document_type, s.count])),
        byStatus: Object.fromEntries(statusStats.map(s => [s.status, s.count]))
      }
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/other-documents
 * Create a new document record
 * 
 * Body:
 * {
 *   document_type: string,
 *   vendor_name?: string,
 *   amount?: number,
 *   document_date?: string,
 *   reference_number?: string,
 *   pdf_path?: string,
 *   source_email_id?: string,
 *   email_subject?: string,
 *   email_from?: string,
 *   classification_confidence?: number,
 *   raw_extracted_data?: object,
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    
    // Check access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      document_type,
      vendor_name,
      amount,
      document_date,
      reference_number,
      pdf_path,
      source_email_id,
      email_subject,
      email_from,
      classification_confidence,
      raw_extracted_data,
      notes
    } = body;

    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO other_documents (
        id, document_type, vendor_name, amount, document_date,
        reference_number, pdf_path, source_email_id, email_subject,
        email_from, classification_confidence, raw_extracted_data,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      document_type,
      vendor_name || null,
      amount || null,
      document_date || null,
      reference_number || null,
      pdf_path || null,
      source_email_id || null,
      email_subject || null,
      email_from || null,
      classification_confidence || null,
      raw_extracted_data ? JSON.stringify(raw_extracted_data) : null,
      'pending',
      notes || null,
      now,
      now
    );

    console.log('[API][OTHER-DOCS] Created document:', id, document_type);

    return NextResponse.json({
      success: true,
      document: {
        id,
        document_type,
        status: 'pending',
        created_at: now
      }
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/other-documents
 * Update document status or notes
 * 
 * Body:
 * {
 *   id: string,
 *   status?: 'pending' | 'reviewed' | 'applied' | 'archived',
 *   notes?: string
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    
    // Check access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    // Build update query
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (status) {
      const validStatuses = ['pending', 'reviewed', 'applied', 'archived'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    params.push(id);

    const result = db.prepare(`
      UPDATE other_documents 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    console.log('[API][OTHER-DOCS] Updated document:', id, { status, notes: notes ? 'updated' : 'unchanged' });

    return NextResponse.json({
      success: true,
      message: 'Document updated'
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/other-documents
 * Archive or delete a document
 * 
 * Query params:
 * - id: Document ID to delete
 * - permanent: If 'true', permanently delete; otherwise archive
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    
    // Check access - only admin can delete
    const hasAccess = await isAdmin(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    if (permanent) {
      // Permanently delete
      const result = db.prepare('DELETE FROM other_documents WHERE id = ?').run(id);
      if (result.changes === 0) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      console.log('[API][OTHER-DOCS] Permanently deleted document:', id);
    } else {
      // Archive (set status to 'archived')
      const result = db.prepare(`
        UPDATE other_documents 
        SET status = 'archived', updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), id);
      
      if (result.changes === 0) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      console.log('[API][OTHER-DOCS] Archived document:', id);
    }

    return NextResponse.json({
      success: true,
      message: permanent ? 'Document deleted' : 'Document archived'
    });

  } catch (error: any) {
    console.error('[API][OTHER-DOCS] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
