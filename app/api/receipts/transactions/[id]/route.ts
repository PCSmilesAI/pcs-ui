/**
 * GET    /api/receipts/transactions/[id]  — one Amex transaction
 * PATCH  /api/receipts/transactions/[id]  — edit fields (merchant, category, …)
 * DELETE /api/receipts/transactions/[id]  — delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
} from '@/lib/receipts/transactions-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const txn = getTransactionById(params.id);
    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    return NextResponse.json({ transaction: txn });
  } catch (err: any) {
    console.error('[receipts/transactions/[id]] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const txn = updateTransaction(params.id, body);
    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    return NextResponse.json({ transaction: txn });
  } catch (err: any) {
    console.error('[receipts/transactions/[id]] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ok = deleteTransaction(params.id);
    if (!ok) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    return NextResponse.json({ ok: true, id: params.id });
  } catch (err: any) {
    console.error('[receipts/transactions/[id]] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
