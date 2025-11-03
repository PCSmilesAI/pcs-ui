import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

const ROOT_DIR = path.resolve(process.cwd());
const DATA_DIR = process.env.PCS_DATA_DIR || path.join(ROOT_DIR, 'pcs_ui_data');
const INGEST_DB_PATH = path.join(DATA_DIR, 'ingest.db');
const SCAN_LOCK_PATH = path.join(DATA_DIR, 'locks', 'inbox.scan.lock');
const INVOICE_QUEUE_PATHS = [
  path.join(DATA_DIR, 'invoice_queue.json'),
  path.join(ROOT_DIR, 'pcs_ai_data', 'invoice_queue.json'),
];

interface HealthStatus {
  ok: boolean;
  interval_ms: number;
  last_scan?: {
    timestamp: string;
    added: number;
    skipped: number;
    duration_ms: number;
    error?: string;
  };
  queue_counts: {
    total: number;
    visible: number;
    deleted: number;
  };
  seen_messages_count: number;
  scan_in_progress: boolean;
  data_dir: string;
}

function getSeenMessagesCount(): number {
  if (!fs.existsSync(INGEST_DB_PATH)) {
    return 0;
  }

  try {
    const db = new Database(INGEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as count FROM seen_messages').get() as any;
    db.close();
    return row?.count || 0;
  } catch (err) {
    console.error('[INBOX][HEALTH][DB_ERROR]', err);
    return 0;
  }
}

function getQueueCounts(): { total: number; visible: number; deleted: number } {
  for (const queuePath of INVOICE_QUEUE_PATHS) {
    if (fs.existsSync(queuePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
        const invoices = Array.isArray(data) ? data : (data.invoices || []);
        
        const total = invoices.length;
        const deleted = invoices.filter((inv: any) => 
          inv.deleted === true || 
          inv.deleted_meta || 
          inv.workflow_deleted_at
        ).length;
        const visible = total - deleted;
        
        return { total, visible, deleted };
      } catch (e) {
        console.error('[INBOX][HEALTH][QUEUE_ERROR]', e);
      }
    }
  }
  
  return { total: 0, visible: 0, deleted: 0 };
}

function isScanInProgress(): boolean {
  if (!fs.existsSync(SCAN_LOCK_PATH)) {
    return false;
  }
  
  const lockAge = Date.now() - fs.statSync(SCAN_LOCK_PATH).mtimeMs;
  const staleThreshold = 600000; // 10 minutes
  
  return lockAge < staleThreshold;
}

function getLastScanResult(): any {
  // Try to read from Python's last scan result
  // For now, we'll return null and rely on the watcher to log results
  return null;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const intervalMs = parseInt(process.env.INBOX_SCAN_INTERVAL_MS || '60000', 10);
    const seenCount = getSeenMessagesCount();
    const queueCounts = getQueueCounts();
    const scanInProgress = isScanInProgress();
    const lastScan = getLastScanResult();

    const health: HealthStatus = {
      ok: true,
      interval_ms: intervalMs,
      queue_counts: queueCounts,
      seen_messages_count: seenCount,
      scan_in_progress: scanInProgress,
      data_dir: DATA_DIR,
    };

    if (lastScan) {
      health.last_scan = lastScan;
    }

    console.log('[INBOX][HEALTH]', health);

    return NextResponse.json(health);

  } catch (error: any) {
    console.error('[INBOX][HEALTH][ERROR]', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

