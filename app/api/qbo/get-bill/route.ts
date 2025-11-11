import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '../../../../lib/qbo/qboClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') || '').trim();
    const doc = (searchParams.get('doc') || '').trim();

    await qboClient.initialize();

    let result: any = null;
    let method: string = '';

    if (id) {
      method = 'read-by-id';
      try {
        result = await (qboClient as any).makeRequest?.(`bill/${encodeURIComponent(id)}?minorversion=70`, 'GET');
      } catch (e) {
        // Fallback to query by Id
        result = await (qboClient as any).query?.(`SELECT Id, DocNumber, TxnDate, Balance, TotalAmt, PrivateNote FROM Bill WHERE Id = '${id}'`);
      }
    } else if (doc) {
      method = 'query-by-doc';
      result = await (qboClient as any).query?.(
        `SELECT Id, DocNumber, TxnDate, Balance, TotalAmt, PrivateNote, MetaData FROM Bill WHERE DocNumber = '${doc.replace(/'/g, "''")}'`
      );
    } else {
      return NextResponse.json({ error: 'Provide ?id=<QBO Id> or ?doc=<DocNumber>' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, method, result });
  } catch (error: any) {
    // Log full error server-side only
    console.error('[QBO][GET_BILL]', 'error', { error: error?.message });
    // Return safe error message to client
    return NextResponse.json({ ok: false, error: 'Failed to retrieve bill' }, { status: 500 });
  }
}



