import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '../../../lib/workflow/dataDir';
import { listVisibleFor } from '../../../lib/workflow/invoiceStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const dataDir = process.env.PCS_DATA_DIR || '';
    const file = resolveDataPath('invoice_queue.json');
    let fileExists = false;
    let fileSize = 0;
    try {
      const st = fs.statSync(file);
      fileExists = true;
      fileSize = st.size;
    } catch (_) {
      fileExists = false;
    }

    const invoices = await listVisibleFor();
    return NextResponse.json({
      ok: true,
      env: {
        PCS_ENV: process.env.PCS_ENV || '',
        NODE_ENV: process.env.NODE_ENV || '',
        PCS_DATA_DIR: dataDir,
      },
      dataFile: {
        path: file,
        exists: fileExists,
        size: fileSize,
      },
      counts: {
        invoices: invoices.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'health_failed' }, { status: 500 });
  }
}

