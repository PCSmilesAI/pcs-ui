import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT_DIR = path.resolve(process.cwd());
const DATA_DIR = process.env.PCS_DATA_DIR || path.join(ROOT_DIR, 'pcs_ui_data');
const LOCKS_DIR = path.join(DATA_DIR, 'locks');
const COOLDOWN_DIR = path.join(LOCKS_DIR, 'cooldown');
const SCAN_LOCK_PATH = path.join(LOCKS_DIR, 'inbox.scan.lock');
const WATCHER_SCRIPT = path.join(ROOT_DIR, 'email_ingestion_agent_enhanced.py');

// Ensure directories exist
if (!fs.existsSync(LOCKS_DIR)) {
  fs.mkdirSync(LOCKS_DIR, { recursive: true });
}
if (!fs.existsSync(COOLDOWN_DIR)) {
  fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
}

interface RefreshResult {
  ok: boolean;
  added?: number;
  skipped?: number;
  duration_ms?: number;
  error?: string;
  message?: string;
  details?: string;
}

function getCooldownPath(email: string): string {
  // Sanitize email for filename
  const sanitized = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
  return path.join(COOLDOWN_DIR, `${sanitized}.lock`);
}

function isInCooldown(email: string): boolean {
  const cooldownPath = getCooldownPath(email);
  if (!fs.existsSync(cooldownPath)) {
    return false;
  }
  
  const lockAge = Date.now() - fs.statSync(cooldownPath).mtimeMs;
  const cooldownMs = 30000; // 30 seconds
  
  if (lockAge < cooldownMs) {
    return true;
  }
  
  // Cooldown expired, remove lock
  try {
    fs.unlinkSync(cooldownPath);
  } catch (e) {
    // Ignore errors
  }
  return false;
}

function setCooldown(email: string): void {
  const cooldownPath = getCooldownPath(email);
  fs.writeFileSync(cooldownPath, `${Date.now()}\n${email}\n`);
}

function isGlobalScanBusy(): boolean {
  if (!fs.existsSync(SCAN_LOCK_PATH)) {
    return false;
  }
  
  const lockAge = Date.now() - fs.statSync(SCAN_LOCK_PATH).mtimeMs;
  const staleThreshold = 600000; // 10 minutes
  
  if (lockAge > staleThreshold) {
    // Stale lock, remove it
    try {
      fs.unlinkSync(SCAN_LOCK_PATH);
    } catch (e) {
      // Ignore errors
    }
    return false;
  }
  
  return true;
}

function runInboxScanOnce(fullScan: boolean = false): Promise<RefreshResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    // Run the Python script's check_inbox function once
    const pythonBool = fullScan ? 'True' : 'False'; // Python uses True/False, not true/false
    const pythonCode = `
import sys
sys.path.insert(0, '${ROOT_DIR.replace(/\\/g, '\\\\')}')
import email_ingestion_agent_enhanced
email_ingestion_agent_enhanced.check_inbox(full_scan=${pythonBool})
import json
print(json.dumps(email_ingestion_agent_enhanced._last_scan_result))
`;
    
    const proc = spawn('python3', ['-c', pythonCode], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PCS_DATA_DIR: DATA_DIR,
      },
      timeout: 120000, // 2 minute timeout
    });
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      const duration_ms = Date.now() - startTime;

      if (code !== 0) {
        console.error('[INBOX][REFRESH][ERROR]', { code, stderr, stdout });
        resolve({
          ok: false,
          error: `Scan failed with code ${code}`,
          details: stderr || stdout,
          duration_ms,
        });
        return;
      }
      
      // Try to parse the last line as JSON (the result)
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      
      try {
        const result = JSON.parse(lastLine);
        resolve({
          ok: true,
          added: result.added || 0,
          skipped: result.skipped || 0,
          duration_ms: result.duration_ms || duration_ms,
        });
      } catch (e) {
        // Couldn't parse result, return generic success
        resolve({
          ok: true,
          added: 0,
          skipped: 0,
          duration_ms,
        });
      }
    });
    
    proc.on('error', (err) => {
      console.error('[INBOX][REFRESH][ERROR]', err);
      resolve({
        ok: false,
        error: err.message,
        duration_ms: Date.now() - startTime,
      });
    });
  });
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email || 'unknown';
    const fullScan = body.full_scan === true; // One-time full inbox analysis

    console.log('[INBOX][REFRESH][REQUEST]', { email, fullScan });

    // Check cooldown (skip for full scans)
    if (!fullScan && isInCooldown(email)) {
      console.log('[INBOX][REFRESH][COOLDOWN]', { email });
      return NextResponse.json({
        ok: false,
        message: 'Please wait 30 seconds between refresh requests',
      }, { status: 429 });
    }

    // Check if global scan is busy
    if (isGlobalScanBusy()) {
      console.log('[INBOX][REFRESH][BUSY]', { email });
      return NextResponse.json({
        ok: false,
        message: 'A scan is already in progress. Please try again in a moment.',
      }, { status: 503 });
    }

    // Set cooldown (skip for full scans)
    if (!fullScan) {
      setCooldown(email);
    }

    // Run scan
    console.log('[INBOX][REFRESH][START]', { email, fullScan });
    const result = await runInboxScanOnce(fullScan);
    console.log('[INBOX][REFRESH][END]', { email, fullScan, result });
    
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[INBOX][REFRESH][ERROR]', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

