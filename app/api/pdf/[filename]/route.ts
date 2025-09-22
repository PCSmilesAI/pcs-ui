import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;
  
  // Security check - only allow PDF files
  if (!filename.endsWith('.pdf')) {
    return new NextResponse('Only PDF files are allowed', { status: 400 });
  }
  
  // Construct the file path
  const filePath = path.join(process.cwd(), 'email_invoices', filename);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return new NextResponse('PDF not found', { status: 404 });
    }
    
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Return the PDF with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
      },
    });
  } catch (error) {
    console.error('Error serving PDF:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
