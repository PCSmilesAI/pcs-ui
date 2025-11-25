import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '../../../../lib/workflow/dataDir';
import { isSafeFilename } from '../../../../lib/security/filename';

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
  if (!isSafeFilename(filename)) {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  // Security check - only allow PDF files
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return new NextResponse('Only PDF files are allowed', { status: 400 });
  }

  // Try multiple locations for PDFs (in order of preference)
  const possibleDirs = [
    resolveDataPath('email_invoices'),  // PCS_DATA_DIR/email_invoices (primary)
    path.join(process.cwd(), 'dist', 'email_invoices'),  // dist/email_invoices (build output)
    path.join(process.cwd(), 'email_invoices'),  // root email_invoices (fallback)
  ];

  let filePath: string | null = null;
  let baseDir: string | null = null;

  // Try each directory until we find the file
  for (const dir of possibleDirs) {
    const testPath = path.join(dir, filename);
    if (fs.existsSync(testPath)) {
      filePath = testPath;
      baseDir = dir;
      break;
    }
  }

  // If file not found in any location, return 404
  if (!filePath || !baseDir) {
    console.warn('[PDF API] PDF not found:', {
      filename,
      searchedDirs: possibleDirs,
      cwd: process.cwd(),
      dataDir: resolveDataPath('email_invoices')
    });
    return new NextResponse('PDF not found', { status: 404 });
  }

  // Security check - ensure path is within base directory
  if (!isPathWithinBase(filePath, baseDir)) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  try {

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
