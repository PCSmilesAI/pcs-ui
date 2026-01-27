/**
 * Train Knowledge Base API for Other Documents
 * 
 * POST /api/other-documents/[id]/train
 * Updates the vendor's knowledge base to recognize this document type
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';
import { trainFromOtherDocument } from '@/lib/gpt/trainOtherDocument';
import { DocumentType } from '@/lib/gpt/documentClassifier';
import { isPathWithinBase } from '@/lib/security/path-validation';

export const dynamic = 'force-dynamic';

/**
 * Resolve PDF path to absolute filesystem path
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;

  // Extract filename from any path format
  let filename = pdfPath;

  if (pdfPath.includes('/')) {
    const parts = pdfPath.split('/');
    filename = parts[parts.length - 1] || '';
  }

  if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  // Try multiple possible locations
  const possiblePaths = [
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'pdfs', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      if (isPathWithinBase(p, process.cwd())) {
        return p;
      }
    }
  }

  return null;
}

/**
 * POST /api/other-documents/[id]/train
 * Train the vendor's knowledge base to recognize this document type
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(request);
    const documentId = params.id;

    // Check access - only admins and AP can train
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDatabase();

    // Get the document
    const document = db.prepare(`
      SELECT * FROM other_documents WHERE id = ?
    `).get(documentId) as any;

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Validate vendor name
    if (!document.vendor_name) {
      return NextResponse.json({ 
        error: 'Vendor name is required for training. Please set the vendor name first.' 
      }, { status: 400 });
    }

    // Validate document type
    const validTypes: DocumentType[] = [
      'credit_memo', 'statement', 'payment_confirmation', 
      'receipt', 'packing_slip', 'letter', 'marketing', 'other'
    ];
    
    if (!document.document_type || !validTypes.includes(document.document_type)) {
      return NextResponse.json({ 
        error: 'Valid document type is required for training. Please set the document type first.' 
      }, { status: 400 });
    }

    // Resolve PDF path
    const pdfPath = resolvePdfPath(document.pdf_path);
    if (!pdfPath) {
      console.warn('[API][TRAIN-OTHER] PDF not found, training without images:', document.pdf_path);
    }

    console.log('[API][TRAIN-OTHER] Starting training:', {
      documentId,
      vendor: document.vendor_name,
      type: document.document_type,
      pdfPath: pdfPath || 'not found',
      user: user.email
    });

    // Parse any extracted data
    let extractedData = {};
    if (document.raw_extracted_data) {
      try {
        extractedData = typeof document.raw_extracted_data === 'string'
          ? JSON.parse(document.raw_extracted_data)
          : document.raw_extracted_data;
      } catch (e) {
        console.warn('[API][TRAIN-OTHER] Could not parse raw_extracted_data');
      }
    }

    // Train the knowledge base
    const result = await trainFromOtherDocument({
      vendorName: document.vendor_name,
      documentType: document.document_type as DocumentType,
      pdfPath: pdfPath || '',
      documentDate: document.document_date,
      userNote: document.user_note,
      extractedData
    });

    if (!result.success) {
      console.error('[API][TRAIN-OTHER] Training failed:', result.error);
      return NextResponse.json({ 
        error: result.error || 'Training failed' 
      }, { status: 500 });
    }

    // Mark the document as used for training
    db.prepare(`
      UPDATE other_documents 
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(documentId);

    console.log('[API][TRAIN-OTHER] Training completed successfully:', {
      vendor: result.vendorName,
      type: result.documentType,
      version: result.version
    });

    return NextResponse.json({
      success: true,
      message: `Knowledge base for ${result.vendorName} updated to recognize ${document.document_type} documents`,
      vendorName: result.vendorName,
      documentType: result.documentType,
      version: result.version
    });

  } catch (error: any) {
    console.error('[API][TRAIN-OTHER] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
