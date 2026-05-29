/**
 * GET  /api/receipts/reports  — list reports (?status=submitted|approved|closed) + status counts
 * POST /api/receipts/reports  — create a report from receipts: { receiptIds: [...], notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  listReports,
  getReportStatusCounts,
  createReport,
  type ReportStatus,
} from '@/lib/receipts/reports-store';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const status = req.nextUrl.searchParams.get('status') as ReportStatus | null;
    const valid = status === 'submitted' || status === 'approved' || status === 'closed';
    return NextResponse.json({
      reports: listReports(valid ? status! : undefined),
      counts: getReportStatusCounts(),
    });
  } catch (err: any) {
    console.error('[receipts/reports] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const receiptIds = Array.isArray(body?.receiptIds) ? body.receiptIds.map(String) : [];
    if (receiptIds.length === 0) {
      return NextResponse.json({ error: 'receiptIds is required' }, { status: 400 });
    }
    const report = createReport({
      submitted_by: user.email,
      receiptIds,
      notes: body.notes ? String(body.notes) : '',
    });
    if (report.expense_count === 0) {
      return NextResponse.json(
        { error: 'No eligible receipts (already on a report or not found)' },
        { status: 400 }
      );
    }
    return NextResponse.json({ report }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts/reports] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
