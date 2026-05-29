/**
 * GET  /api/receipts/transactions   — list Amex transactions (+ stats).
 *                                       Filters: ?status= ?card= ?q=
 * POST /api/receipts/transactions   — import a statement:
 *                                       • multipart/form-data file (CSV or XLSX), or
 *                                       • JSON { rows: [{transaction_date, amount, merchant_name, ...}] }
 *
 * Parsing uses the `xlsx` dependency (reads CSV and XLSX). Headers are matched
 * fuzzily so common Amex export layouts work without configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  listTransactions,
  getTransactionStats,
  bulkInsert,
  type AmexTransaction,
  type TxnFilters,
  type TxnMatchStatus,
} from '@/lib/receipts/transactions-store';

function buildFilters(req: NextRequest): TxnFilters {
  const sp = req.nextUrl.searchParams;
  const filters: TxnFilters = {};
  const status = sp.get('status');
  if (status === 'unmatched' || status === 'matched' || status === 'needs_review') {
    filters.matchStatus = status as TxnMatchStatus;
  }
  const card = sp.get('card');
  if (card) filters.cardLast4 = card;
  const q = sp.get('q');
  if (q) filters.search = q;
  return filters;
}

// Map a loosely-keyed statement row to our transaction shape.
function mapRow(row: Record<string, unknown>): Partial<AmexTransaction> {
  const keys = Object.keys(row);
  const find = (...needles: string[]) => {
    const k = keys.find((key) => needles.some((n) => key.toLowerCase().includes(n)));
    return k ? row[k] : undefined;
  };
  const num = (v: unknown) => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const last4 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-4);

  const dateRaw = find('date');
  let transaction_date = '';
  if (dateRaw instanceof Date) transaction_date = dateRaw.toISOString().slice(0, 10);
  else if (dateRaw != null) {
    const d = new Date(String(dateRaw));
    transaction_date = Number.isNaN(d.getTime()) ? String(dateRaw) : d.toISOString().slice(0, 10);
  }

  return {
    transaction_date,
    amount: num(find('amount')),
    merchant_name: String(find('description', 'merchant') ?? '').trim(),
    description_raw: String(find('description', 'merchant', 'detail') ?? '').trim(),
    category: String(find('category') ?? '').trim(),
    cardholder_name: String(find('card member', 'cardholder', 'member name') ?? '').trim(),
    card_last4: last4(find('last 4', 'account', 'card number', 'card #', 'card no')),
    reference_number: String(find('reference') ?? '').trim(),
    source: 'import',
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const filters = buildFilters(req);
    return NextResponse.json({
      transactions: listTransactions(filters),
      stats: getTransactionStats(filters),
    });
  } catch (err: any) {
    console.error('[receipts/transactions] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = req.headers.get('content-type') || '';
    let rows: Array<Partial<AmexTransaction>> = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      rows = json.map(mapRow).filter((r) => r.transaction_date && (r.amount || r.merchant_name));
    } else {
      const body = await req.json();
      const raw = Array.isArray(body?.rows) ? body.rows : [];
      rows = raw.map((r: Record<string, unknown>) => mapRow(r));
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found in import' }, { status: 400 });
    }

    const result = bulkInsert(rows);
    return NextResponse.json({ ...result, total: rows.length }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts/transactions] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
