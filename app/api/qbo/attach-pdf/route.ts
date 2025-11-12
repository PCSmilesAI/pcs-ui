import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '../../../../lib/qbo/qboClient';
import { getLatestTokens } from '../../../../lib/qbo/memoryStorage';
import fs from 'fs';
import path from 'path';
import { isPathWithinBase } from '../../../../lib/security/path-validation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { billId, pdfPath } = body;

    console.log('🔄 Attaching PDF to QuickBooks bill:', billId);

    if (!billId || !pdfPath) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: billId and pdfPath'
      }, { status: 400 });
    }

    // Check if QuickBooks is connected
    const tokens = await getLatestTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: 'QuickBooks not connected. Please connect to QuickBooks first.'
      }, { status: 400 });
    }

    // Initialize QBO client
    await qboClient.initialize();

    // Check if PDF file exists
    const baseDir = path.join(process.cwd(), 'public');
    const fullPdfPath = path.join(baseDir, pdfPath);

    // SECURITY: Validate path is within public directory
    if (!isPathWithinBase(fullPdfPath, baseDir)) {
      console.error('❌ Path traversal attempt detected in PDF path:', pdfPath);
      return NextResponse.json({
        success: false,
        error: 'Invalid PDF path'
      }, { status: 400 });
    }

    // SECURITY: Path validated above - safe to use
    // lgtm[js/path-injection] - Path validated with isPathWithinBase
    if (!fs.existsSync(fullPdfPath)) {
      return NextResponse.json({
        success: false,
        error: 'PDF file not found'
      }, { status: 404 });
    }

    // SECURITY: Path validated above - safe to use
    // lgtm[js/path-injection] - Path validated with isPathWithinBase
    const pdfBuffer = fs.readFileSync(fullPdfPath);
    const fileName = path.basename(fullPdfPath);

    // Upload attachment to QuickBooks
    const attachmentResult = await qboClient.uploadAttachment(
      billId,
      fileName,
      pdfBuffer,
      'application/pdf'
    );

    console.log('✅ PDF attached to QuickBooks bill successfully');

    return NextResponse.json({
      success: true,
      message: 'PDF attached to QuickBooks bill successfully',
      attachment: {
        billId,
        fileName,
        size: pdfBuffer.length
      }
    });

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Error attaching PDF to QBO bill:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'Failed to attach PDF to QuickBooks bill'
    }, { status: 500 });
  }
}
