/**
 * GET  /api/receipts/[id]    — fetch a single receipt by ID
 * PATCH /api/receipts/[id]   — update a receipt (status, GL coding, match status, notes)
 * DELETE /api/receipts/[id]  — soft-delete a receipt
 *
 * McKay — implement the business logic here:
 *   - PATCH is where you'll update match status once Amex transactions are reconciled
 *   - Use lib/receipts/receipt-service.ts for the logic layer
 *   - Keep direct DB calls in lib/receipts/db-store.ts
 *
 * Auth pattern: import { getCurrentUser } from '@/lib/auth/currentUser';
 * DB pattern: import { getDatabase } from '@/lib/db/client';
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getReceiptById, updateReceipt } from '@/lib/receipts/db-store';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipt = getReceiptById(params.id);
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }
    return NextResponse.json({ receipt });
  } catch (err: any) {
    console.error('[receipts/[id]] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // TODO (McKay): validate allowed update fields before passing to updateReceipt
    const updated = updateReceipt(params.id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }
    return NextResponse.json({ receipt: updated });
  } catch (err: any) {
    console.error('[receipts/[id]] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
