import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { parseInvoiceWithGPT, testGPTConnection } from '../../../lib/gpt/parseInvoice';
import { isPathWithinBase } from '../../../lib/security/path-validation';

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
    path.join(process.cwd(), 'sample_invoices_pcs', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      // Validate path is within allowed directories
      if (isPathWithinBase(p, process.cwd())) {
        return p;
      }
    }
  }

  // Also check subdirectories of sample_invoices_pcs
  const sampleDir = path.join(process.cwd(), 'sample_invoices_pcs');
  if (fs.existsSync(sampleDir)) {
    const subdirs = fs.readdirSync(sampleDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const subdir of subdirs) {
      const subPath = path.join(sampleDir, subdir, filename);
      if (fs.existsSync(subPath) && isPathWithinBase(subPath, process.cwd())) {
        return subPath;
      }
    }
  }

  return null;
}

/**
 * POST /api/gpt-parse
 * Parse an invoice using PCS AI vision
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfPath, vendorHint } = body;

    if (!pdfPath) {
      return NextResponse.json(
        { error: 'pdfPath is required' },
        { status: 400 }
      );
    }

    // Resolve the PDF path
    const resolvedPath = resolvePdfPath(pdfPath);
    if (!resolvedPath) {
      return NextResponse.json(
        { error: 'PDF file not found', pdfPath },
        { status: 404 }
      );
    }

    console.log('[PCS-AI-PARSE] Parsing invoice:', resolvedPath);

    // Parse with PCS AI
    const result = await parseInvoiceWithGPT(resolvedPath, vendorHint);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Parsing failed',
          vendorDetected: result.vendorDetected
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      vendorDetected: result.vendorDetected,
      knowledgeBaseUsed: result.knowledgeBaseUsed,
      pdfPath: pdfPath
    });

  } catch (error: any) {
    console.error('[PCS-AI-PARSE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gpt-parse
 * Health check / test GPT connection
 */
export async function GET() {
  try {
    const connectionTest = await testGPTConnection();

    return NextResponse.json({
      service: 'gpt-parse',
      status: connectionTest.connected ? 'ok' : 'error',
      model: connectionTest.model,
      error: connectionTest.error,
      apiKeyConfigured: !!process.env.OPENAI_API_KEY
    });
  } catch (error: any) {
    return NextResponse.json({
      service: 'gpt-parse',
      status: 'error',
      error: error.message,
      apiKeyConfigured: !!process.env.OPENAI_API_KEY
    });
  }
}
