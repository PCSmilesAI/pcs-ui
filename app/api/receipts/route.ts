/**
 * GET  /api/receipts   — list receipts (+ summary stats). Supports filters:
 *                          ?status=unmatched|matched|disputed  ?mine=1  ?q=<search>
 * POST /api/receipts   — create a receipt. Two modes:
 *                          • JSON body                → manual entry
 *                          • multipart/form-data file → upload, AI-parse, categorize
 *
 * Auth:   import { getCurrentUser } from '@/lib/auth/currentUser';
 * DB:     all reads/writes go through lib/receipts/db-store.ts
 * Model:  parsing reads process.env.PCS_LLM_PROVIDER / PCS_LLM_MODEL (never hard-coded)
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  getAllReceipts,
  createReceipt,
  getReceiptStats,
  type MatchStatus,
  type ReceiptFilters,
} from '@/lib/receipts/db-store';
import {
  parseReceiptImage,
  categorizeReceipt,
  type ReceiptParseResult,
} from '@/lib/receipts/receipt-service';

const RECEIPTS_DIR = path.join(process.cwd(), 'email_invoices', 'receipts');

function buildFilters(req: NextRequest, userEmail: string): ReceiptFilters {
  const sp = req.nextUrl.searchParams;
  const filters: ReceiptFilters = {};
  const status = sp.get('status');
  if (status === 'unmatched' || status === 'matched' || status === 'disputed') {
    filters.matchStatus = status as MatchStatus;
  }
  if (sp.get('mine') === '1' && userEmail) filters.submittedBy = userEmail;
  const q = sp.get('q');
  if (q) filters.search = q;
  return filters;
}

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filters = buildFilters(req, user.email);
    const receipts = getAllReceipts(filters);
    const stats = getReceiptStats(filters);
    return NextResponse.json({ receipts, stats });
  } catch (err: any) {
    console.error('[receipts] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';

    // ─── Mode A: file upload → save, AI-parse, auto-categorize ──────────────
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${randomUUID()}-${safeName}`;
      const fullPath = path.join(RECEIPTS_DIR, filename);
      const bytes = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(fullPath, bytes);
      const relPath = path.join('email_invoices', 'receipts', filename);

      // Best-effort AI extraction — never fail the upload if parsing breaks.
      let parsed: ReceiptParseResult | null = null;
      let parseError: string | null = null;
      try {
        parsed = await parseReceiptImage(fullPath);
      } catch (e: any) {
        parseError = e?.message || 'parse failed';
        console.error('[receipts] parse error:', parseError);
      }

      const vendor = parsed?.vendor || '';
      const amount = parsed?.amount || 0;
      const gl_account = vendor ? await categorizeReceipt(vendor, amount) : '';

      const receipt = createReceipt({
        vendor,
        amount,
        date: parsed?.date || '',
        gl_account,
        card_last4: parsed?.card_last4 || '',
        match_status: 'unmatched',
        submitted_by: user.email,
        image_path: relPath,
      });

      return NextResponse.json({ receipt, parsed, parseError }, { status: 201 });
    }

    // ─── Mode B: manual JSON entry ──────────────────────────────────────────
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!body.vendor || typeof body.vendor !== 'string') {
      return NextResponse.json({ error: 'vendor is required' }, { status: 400 });
    }
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
    }

    const gl_account = body.gl_account || (await categorizeReceipt(body.vendor, amount));

    const receipt = createReceipt({
      vendor: body.vendor,
      amount,
      date: typeof body.date === 'string' ? body.date : '',
      gl_account,
      location: typeof body.location === 'string' ? body.location : '',
      card_last4: typeof body.card_last4 === 'string' ? body.card_last4 : '',
      match_status: 'unmatched',
      submitted_by: user.email,
      notes: typeof body.notes === 'string' ? body.notes : '',
    });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
