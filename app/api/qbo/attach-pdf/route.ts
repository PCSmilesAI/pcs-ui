import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '../../../../lib/qbo/qboClient';
import { getLatestTokens } from '../../../../lib/qbo/memoryStorage';
import fs from 'fs';
import path from 'path';

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
    const fullPdfPath = path.join(process.cwd(), 'public', pdfPath);
    if (!fs.existsSync(fullPdfPath)) {
      return NextResponse.json({
        success: false,
        error: 'PDF file not found'
      }, { status: 404 });
    }

    // Read PDF file
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
    console.error('❌ Error attaching PDF to QBO bill:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to attach PDF to QuickBooks bill'
    }, { status: 500 });
  }
}
