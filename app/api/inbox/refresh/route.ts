import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isPathWithinBase } from '../../../../lib/security/path-validation';

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

  // SECURITY: Validate path is within cooldown directory
  if (!isPathWithinBase(cooldownPath, COOLDOWN_DIR)) {
    console.error('❌ Path traversal attempt detected in cooldown path');
    return false;
  }

  // SECURITY: Path validated above - safe to use
  // lgtm[js/path-injection] - Path validated with isPathWithinBase
  if (!fs.existsSync(cooldownPath)) {
    return false;
  }

  // SECURITY: Path validated above - safe to use
  // lgtm[js/path-injection] - Path validated with isPathWithinBase
  const lockAge = Date.now() - fs.statSync(cooldownPath).mtimeMs;
  const cooldownMs = 30000; // 30 seconds

  if (lockAge < cooldownMs) {
    return true;
  }

  // Cooldown expired, remove lock
  // SECURITY: Path validated above - safe to use
  // lgtm[js/path-injection] - Path validated with isPathWithinBase
  try {
    fs.unlinkSync(cooldownPath);
  } catch (e) {
    // Ignore errors
  }
  return false;
}

function setCooldown(email: string): void {
  const cooldownPath = getCooldownPath(email);

  // SECURITY: Validate path is within cooldown directory
  if (!isPathWithinBase(cooldownPath, COOLDOWN_DIR)) {
    console.error('❌ Path traversal attempt detected in cooldown path');
    return;
  }

  // SECURITY: Path validated above - safe to use
  // lgtm[js/path-injection] - Path validated with isPathWithinBase
  fs.writeFileSync(cooldownPath, `${Date.now()}\n${email}\n`);
}

function isGlobalScanBusy(): boolean {
  // SECURITY: SCAN_LOCK_PATH is a constant defined at module level - safe to use
  // lgtm[js/path-injection] - SCAN_LOCK_PATH is a constant, not user input
  if (!fs.existsSync(SCAN_LOCK_PATH)) {
    return false;
  }

  // SECURITY: SCAN_LOCK_PATH is a constant defined at module level - safe to use
  // lgtm[js/path-injection] - SCAN_LOCK_PATH is a constant, not user input
  const lockAge = Date.now() - fs.statSync(SCAN_LOCK_PATH).mtimeMs;
  const staleThreshold = 600000; // 10 minutes

  if (lockAge > staleThreshold) {
    // Stale lock, remove it
    // SECURITY: SCAN_LOCK_PATH is a constant defined at module level - safe to use
    // lgtm[js/path-injection] - SCAN_LOCK_PATH is a constant, not user input
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
    let resolved = false;

    const safeResolve = (result: RefreshResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

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
      timeout: 240000, // 4 minute timeout (less than maxDuration)
    });
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle timeout explicitly
    const timeoutId = setTimeout(() => {
      if (!proc.killed && !resolved) {
        console.warn('[INBOX][REFRESH][TIMEOUT]', 'Process exceeded timeout, killing...');
        proc.kill('SIGTERM');
        // Give it a moment to clean up, then force kill
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
        safeResolve({
          ok: false,
          error: 'Inbox scan timed out after 4 minutes',
          duration_ms: Date.now() - startTime,
        });
      }
    }, 240000); // 4 minutes
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (resolved) return; // Already resolved due to timeout

      const duration_ms = Date.now() - startTime;

      if (code !== 0) {
        console.error('[INBOX][REFRESH][ERROR]', { code, stderr, stdout });
        safeResolve({
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
        safeResolve({
          ok: true,
          added: result.added || 0,
          skipped: result.skipped || 0,
          duration_ms: result.duration_ms || duration_ms,
        });
      } catch (e) {
        // Couldn't parse result, return generic success
        safeResolve({
          ok: true,
          added: 0,
          skipped: 0,
          duration_ms,
        });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      // Log full error server-side only
      console.error('[INBOX][REFRESH][ERROR]', err);
      // Return safe error message to client
      safeResolve({
        ok: false,
        error: 'Inbox scan failed',
        duration_ms: Date.now() - startTime,
      });
    });
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Next.js 14+)

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
    // Log full error server-side only
    console.error('[INBOX][REFRESH][ERROR]', error);
    // Return safe error message to client
    return NextResponse.json({
      ok: false,
      error: 'Inbox refresh failed',
    }, { status: 500 });
  }
}

