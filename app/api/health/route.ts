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

    // Database connectivity check
    let dbHealthy = false;
    try {
      const { getDatabase } = await import('../../../lib/db/client');
      const db = getDatabase();
      db.prepare('SELECT 1').get(); // Simple query to test connectivity
      dbHealthy = true;
    } catch (dbError: any) {
      console.error('[HEALTH] Database check failed:', dbError?.message);
    }

    const invoices = await listVisibleFor();
    
    // External service connectivity (with timeout)
    const externalServices: Record<string, boolean> = {};
    try {
      // QuickBooks token check (non-blocking)
      const { tokenStorage } = await import('../../../lib/qbo/tokenStorage');
      const tokens = await tokenStorage.listTokens();
      externalServices.qbo_tokens_available = tokens.length > 0;
    } catch (_) {
      externalServices.qbo_tokens_available = false;
    }

    const health = {
      ok: true,
      status: dbHealthy ? 'healthy' : 'degraded',
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
      database: {
        connected: dbHealthy,
      },
      externalServices,
      counts: {
        invoices: invoices.length,
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    return NextResponse.json(health, { 
      status: dbHealthy ? 200 : 503 // 503 if database is down
    });
  } catch (error: any) {
    return NextResponse.json({ 
      ok: false, 
      status: 'unhealthy',
      error: error?.message || 'health_failed' 
    }, { status: 500 });
  }
}

