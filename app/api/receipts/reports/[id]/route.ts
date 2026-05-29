/**
 * GET   /api/receipts/reports/[id]  — one report + its receipts
 * PATCH /api/receipts/reports/[id]  — change status: { status: 'approved'|'closed'|'submitted' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getReportById, updateReportStatus, type ReportStatus } from '@/lib/receipts/reports-store';

const VALID: ReportStatus[] = ['submitted', 'approved', 'closed'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const report = getReportById(params.id);
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err: any) {
    console.error('[receipts/reports/[id]] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (!VALID.includes(body?.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const report = updateReportStatus(params.id, {
      status: body.status,
      approver_email: user.email,
    });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err: any) {
    console.error('[receipts/reports/[id]] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
