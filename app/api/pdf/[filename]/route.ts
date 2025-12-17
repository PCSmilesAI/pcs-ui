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

/**
 * Extract base filename without hash suffix and extension
 * e.g., "Darby_Invoice_5594577_2a8dacff.pdf" -> "Darby_Invoice_5594577"
 * e.g., "Patterson  Invoice # 3039224956.PDF" -> "Patterson  Invoice # 3039224956"
 */
function getBaseFilename(filename: string): string {
  // Remove .pdf extension (case insensitive)
  let base = filename.replace(/\.pdf$/i, '');
  // Remove hash suffix if present (e.g., _2a8dacff - 8 hex chars)
  base = base.replace(/_[a-f0-9]{8}$/i, '');
  return base;
}

/**
 * Find matching file in directory with smart matching:
 * 1. Exact match
 * 2. Case-insensitive extension match (.PDF -> .pdf)
 * 3. Base filename match (ignoring hash suffixes)
 */
function findMatchingFile(dir: string, requestedFilename: string): string | null {
  // Check if directory exists first
  if (!fs.existsSync(dir)) {
    return null;
  }

  // 1. Try exact match
  const exactPath = path.join(dir, requestedFilename);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  // 2. Try case-insensitive extension match (.PDF -> .pdf)
  if (requestedFilename.endsWith('.PDF')) {
    const lowerPath = path.join(dir, requestedFilename.slice(0, -4) + '.pdf');
    if (fs.existsSync(lowerPath)) {
      return lowerPath;
    }
  }

  // 3. Try finding file with same base name + hash suffix
  // This handles cases where db has "file.pdf" but actual file is "file_abc12345.pdf"
  try {
    const baseName = getBaseFilename(requestedFilename);
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      // Only consider PDF files
      if (!file.toLowerCase().endsWith('.pdf')) continue;
      
      const fileBase = getBaseFilename(file);
      if (fileBase.toLowerCase() === baseName.toLowerCase()) {
        return path.join(dir, file);
      }
    }
  } catch (err) {
    // Directory read failed, continue to next directory
    console.warn('[PDF API] Failed to read directory for fuzzy match:', dir, err);
  }

  return null;
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

  // Try each directory with smart filename matching
  for (const dir of possibleDirs) {
    const matchedPath = findMatchingFile(dir, filename);
    if (matchedPath) {
      filePath = matchedPath;
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

    // Use the actual filename from disk for Content-Disposition
    const actualFilename = path.basename(filePath);
    
    // Escape filename for Content-Disposition header
    // SECURITY: Escape backslashes first, then quotes to prevent incomplete escaping
    const escapedFilename = actualFilename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

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
