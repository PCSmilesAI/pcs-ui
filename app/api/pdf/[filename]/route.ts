import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Validates filename to prevent path traversal attacks
 * Only allows alphanumeric characters, dots, dashes, and underscores
 */
function validateFilename(filename: string): boolean {
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Only allow safe characters: alphanumeric, dot, dash, underscore
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return false;
  }

  return true;
}

/**
 * Ensures resolved path is within the base directory
 */
function isPathWithinBase(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  // Security check - validate filename format
  if (!validateFilename(filename)) {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  // Security check - only allow PDF files
  if (!filename.endsWith('.pdf')) {
    return new NextResponse('Only PDF files are allowed', { status: 400 });
  }

  // Construct the file path
  const baseDir = path.join(process.cwd(), 'email_invoices');
  const filePath = path.join(baseDir, filename);

  // Security check - ensure path is within base directory
  if (!isPathWithinBase(filePath, baseDir)) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return new NextResponse('PDF not found', { status: 404 });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);

    // Escape filename for Content-Disposition header
    // SECURITY: Escape backslashes first, then quotes to prevent incomplete escaping
    const escapedFilename = filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    // Return the PDF with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${escapedFilename}"`,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
      },
    });
  } catch (error) {
    // Log full error server-side only
    console.error('Error serving PDF:', error);
    // Return safe error message to client
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
