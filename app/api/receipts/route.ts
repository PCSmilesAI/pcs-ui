/**
 * GET /api/receipts
 *
 * McKay — this is your receipts list endpoint.
 * Implement this to:
 *   1. Authenticate the request (see: lib/auth/currentUser.ts for the pattern)
 *   2. Query the `receipts` table in the shared database (see: lib/receipts/db-store.ts)
 *   3. Return an array of receipt objects as JSON
 *
 * POST /api/receipts
 * Implement this to:
 *   1. Accept a receipt payload (amount, vendor, date, GL account, amex_transaction_id)
 *   2. Validate and save via lib/receipts/receipt-service.ts
 *   3. Return the created receipt
 *
 * Model usage: always read the model from process.env.PCS_LLM_MODEL — never hard-code it.
 * DB pattern: import { getDatabase } from '@/lib/db/client';
 * Auth pattern: import { getCurrentUser } from '@/lib/auth/currentUser';
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getAllReceipts, createReceipt } from '@/lib/receipts/db-store';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipts = getAllReceipts();
    return NextResponse.json({ receipts });
  } catch (err: any) {
    console.error('[receipts] GET error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // TODO (McKay): validate body fields and pass to receipt-service.ts
    const receipt = createReceipt(body);
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (err: any) {
    console.error('[receipts] POST error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
