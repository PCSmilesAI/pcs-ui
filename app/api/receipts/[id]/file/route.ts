/**
 * GET /api/receipts/[id]/file — stream the stored receipt image / PDF inline.
 *
 * Receipt files live under email_invoices/receipts/ (server-local, gitignored).
 * Mirrors the Flask app's GET /receipts/<id> route.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getReceiptById } from '@/lib/receipts/db-store';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipt = getReceiptById(params.id);
    if (!receipt || !receipt.image_path) {
      return NextResponse.json({ error: 'Receipt file not found' }, { status: 404 });
    }

    // Resolve and confine to the receipts directory (prevent path traversal).
    const baseDir = path.join(process.cwd(), 'email_invoices', 'receipts');
    const abs = path.resolve(process.cwd(), receipt.image_path);
    if (!abs.startsWith(baseDir) || !fs.existsSync(abs)) {
      return NextResponse.json({ error: 'Receipt file not found' }, { status: 404 });
    }

    const buf = fs.readFileSync(abs);
    const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${path.basename(abs)}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err: any) {
    console.error('[receipts/[id]/file] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
