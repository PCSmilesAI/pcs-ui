import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { trainFromCorrection } from '../../../lib/gpt/parseInvoice';
import { getKnowledgeBase, getKnowledgeBaseStats } from '../../../lib/gpt/knowledgeBase';
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
      if (isPathWithinBase(p, process.cwd())) {
        return p;
      }
    }
  }

  // Check subdirectories
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
 * POST /api/gpt-train
 * Update a vendor's knowledge base based on correction feedback
 * 
 * This replaces the Telegram notification flow - when an admin corrects an invoice,
 * the correction is sent here to update the knowledge base automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendorName, pdfPath, originalParsed, correctedData, userComment } = body;

    // Validate required fields
    if (!vendorName) {
      return NextResponse.json(
        { error: 'vendorName is required' },
        { status: 400 }
      );
    }

    if (!pdfPath) {
      return NextResponse.json(
        { error: 'pdfPath is required for training' },
        { status: 400 }
      );
    }

    if (!originalParsed || !correctedData) {
      return NextResponse.json(
        { error: 'originalParsed and correctedData are required' },
        { status: 400 }
      );
    }

    // Resolve the PDF path
    const resolvedPath = resolvePdfPath(pdfPath);
    if (!resolvedPath) {
      console.warn('[GPT-TRAIN] PDF not found, training without image:', pdfPath);
      // We'll still try to train, but without the PDF images
      // This allows training from corrections even if PDF isn't available
    }

    console.log('[GPT-TRAIN] Training knowledge base for:', vendorName);
    console.log('[GPT-TRAIN] Changes:', {
      original: originalParsed,
      corrected: correctedData,
      hasComment: !!userComment
    });

    // Include user comment in the corrected data if provided
    const enrichedCorrectedData = userComment
      ? { ...correctedData, _user_comment: userComment }
      : correctedData;

    // Train the knowledge base
    const result = await trainFromCorrection({
      vendorName,
      pdfPath: resolvedPath || '',
      originalParsed,
      correctedData: enrichedCorrectedData
    });

    if (!result.success) {
      console.error('[GPT-TRAIN] Training failed:', result.error);
      return NextResponse.json(
        { 
          error: result.error || 'Training failed',
          vendorName: result.vendorName
        },
        { status: 500 }
      );
    }

    console.log('[GPT-TRAIN] Knowledge base updated successfully:', {
      vendor: result.vendorName,
      version: result.version
    });

    return NextResponse.json({
      success: true,
      vendorName: result.vendorName,
      version: result.version,
      message: `Knowledge base for ${result.vendorName} updated to version ${result.version}`
    });

  } catch (error: any) {
    console.error('[GPT-TRAIN] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gpt-train
 * Get training statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorName = searchParams.get('vendor');

    if (vendorName) {
      // Get specific vendor's knowledge base
      const kb = getKnowledgeBase(vendorName);
      if (!kb) {
        return NextResponse.json(
          { error: 'Knowledge base not found', vendorName },
          { status: 404 }
        );
      }
      return NextResponse.json({
        vendorName: kb.vendor_name,
        version: kb.version,
        lastTrainedAt: kb.last_trained_at,
        trainingInvoiceCount: kb.training_invoice_count,
        promptLength: kb.knowledge_prompt.length
      });
    }

    // Get overall stats
    const stats = getKnowledgeBaseStats();
    return NextResponse.json({
      service: 'gpt-train',
      status: 'ok',
      ...stats
    });
  } catch (error: any) {
    return NextResponse.json({
      service: 'gpt-train',
      status: 'error',
      error: error.message
    });
  }
}
