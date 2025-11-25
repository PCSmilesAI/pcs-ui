import path from 'path';

// Allow readable invoice filenames while blocking traversal and control chars.
// Spaces and a small set of punctuation are permitted for backward compatibility.
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9 _.,+()#&'\-]+$/;

/**
 * Validate a filename coming from a user-controlled source (URL param, body, etc).
 * We explicitly allow spaces and a few punctuation characters because existing
 * invoice PDFs were stored that way, but we still block traversal characters.
 */
export function isSafeFilename(filename: string | undefined | null): filename is string {
  if (!filename) return false;

  // Reject path traversal tokens early
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Keep filenames ASCII-only and visible (no control chars)
  if (!SAFE_FILENAME_PATTERN.test(filename)) {
    return false;
  }

  return filename.trim().length > 0;
}

/**
 * Normalize a filename for storage on disk.
 * - Strips any directory components
 * - Lower-cases the extension
 * - Replaces spaces and `#` with underscores
 * - Collapses runs of underscores
 */
export function normalizePdfFilename(raw: string): string {
  const base = path.basename(raw || '');
  const withoutExt = base.replace(/\.pdf$/i, '');

  const sanitized = withoutExt
    .replace(/[ ]+/g, '_')
    .replace(/#/g, '_')
    .replace(/[^A-Za-z0-9_.()+&,'-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeName = sanitized || 'invoice';
  return `${safeName}.pdf`;
}

/**
 * Build the API path for a given PDF filename using the normalized name.
 */
export function buildApiPdfPath(raw: string): string {
  const normalized = normalizePdfFilename(raw);
  return `/api/pdf/${normalized}`;
}
