/**
 * POST /api/receipts/reports/[id]/export — push an approved report to QBO as a
 * CreditCard Purchase. Marks the report closed + records the QBO Purchase Id on success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { exportReportToQbo } from '@/lib/receipts/qbo-export';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await exportReportToQbo(params.id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[receipts/reports/[id]/export] POST error:', err?.message);
    // Surface the QBO/validation message to the UI (it's actionable, not a secret).
    return NextResponse.json({ error: err?.message || 'Export failed' }, { status: 400 });
  }
}
