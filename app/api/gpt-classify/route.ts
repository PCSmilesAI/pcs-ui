/**
 * PCS AI Document Classification API
 * 
 * POST /api/gpt-classify - Classify a document (invoice, credit memo, statement, etc.)
 * GET /api/gpt-classify - Health check
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { classifyDocument, type EmailContext } from '@/lib/gpt/documentClassifier';
import { isPathWithinBase } from '@/lib/security/path-validation';

export const dynamic = 'force-dynamic';

/**
 * Resolve PDF path to absolute filesystem path
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;

  // If already absolute and exists, validate and return
  const dataDir = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
  if (path.isAbsolute(pdfPath) && fs.existsSync(pdfPath)) {
    if (isPathWithinBase(pdfPath, process.cwd()) || isPathWithinBase(pdfPath, dataDir)) {
      return pdfPath;
    }
    return null;
  }

  // Extract filename from any path format
  let filename = pdfPath;
  if (pdfPath.includes('/')) {
    const parts = pdfPath.split('/');
    filename = parts[parts.length - 1] || '';
  }

  if (!filename) {
    return null;
  }

  // Check for PDF or image extensions
  const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const hasValidExt = validExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  if (!hasValidExt) {
    return null;
  }

  // Try multiple possible locations (including PCS_DATA_DIR which may differ from cwd)
  const possiblePaths = [
    path.join(dataDir, 'email_invoices', filename),
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'pdfs', filename),
    path.join(process.cwd(), 'sample_invoices_pcs', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      // Allow paths within cwd OR within the configured data directory
      if (isPathWithinBase(p, process.cwd()) || isPathWithinBase(p, dataDir)) {
        return p;
      }
    }
  }

  // Also check subdirectories of sample_invoices_pcs
  const sampleDir = path.join(process.cwd(), 'sample_invoices_pcs');
  if (fs.existsSync(sampleDir)) {
    try {
      const subdirs = fs.readdirSync(sampleDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      for (const subdir of subdirs) {
        const subPath = path.join(sampleDir, subdir, filename);
        if (fs.existsSync(subPath) && isPathWithinBase(subPath, process.cwd())) {
          return subPath;
        }
      }
    } catch {
      // Ignore errors reading directory
    }
  }

  return null;
}

/**
 * POST /api/gpt-classify
 * Classify a document using PCS AI vision
 * 
 * Body:
 * {
 *   "pdfPath": "path/to/document.pdf",
 *   "emailContext": {  // optional
 *     "subject": "Invoice #12345",
 *     "from": "billing@vendor.com",
 *     "body": "Please find attached..."
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfPath, emailContext } = body as { 
      pdfPath: string; 
      emailContext?: EmailContext 
    };

    if (!pdfPath) {
      return NextResponse.json(
        { error: 'pdfPath is required' },
        { status: 400 }
      );
    }

    // Resolve the document path
    const resolvedPath = resolvePdfPath(pdfPath);
    if (!resolvedPath) {
      return NextResponse.json(
        { error: 'Document file not found', pdfPath },
        { status: 404 }
      );
    }

    console.log('[PCS-AI-CLASSIFY] Classifying document:', resolvedPath);

    // Classify with PCS AI
    const result = await classifyDocument(resolvedPath, emailContext);

    if (!result.success || !result.result) {
      return NextResponse.json(
        { 
          success: false,
          error: result.error || 'Classification failed',
          pdfPath
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      classification: result.result,
      pdfPath
    });

  } catch (error: any) {
    console.error('[PCS-AI-CLASSIFY] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gpt-classify
 * Health check
 */
export async function GET() {
  return NextResponse.json({
    service: 'gpt-classify',
    status: 'ok',
    description: 'Document classification endpoint',
    supportedTypes: ['invoice', 'credit_memo', 'statement', 'payment_confirmation', 'marketing', 'other'],
    apiKeyConfigured: !!process.env.OPENAI_API_KEY
  });
}
