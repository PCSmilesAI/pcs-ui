import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

type Tokens = {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: number;
  token_type?: string;
};

const DB_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db');

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new Database(DB_PATH);
}

async function getLatestTokens(): Promise<Tokens | null> {
  const db = openDb();
  const row = db
    .prepare(
      'SELECT realm_id, access_token, refresh_token, expires_at FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1'
    )
    .get() as any;
  db.close();

  if (!row) return null;

  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    realm_id: row.realm_id,
    expires_at: row.expires_at * 1000,
    token_type: 'Bearer',
  };
}

async function saveTokens(t: Tokens): Promise<void> {
  const db = openDb();
  db.prepare(
    `INSERT OR REPLACE INTO qbo_tokens (realm_id, access_token, refresh_token, expires_at, updated_at)
     VALUES (@realm_id, @access_token, @refresh_token, @expires_at, strftime('%s','now'))`
  ).run({
    realm_id: t.realm_id,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Math.floor(t.expires_at / 1000),
  });
  db.close();
}

const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function getQboBaseUrl(): string {
  const environment = process.env.QBO_ENVIRONMENT || 'sandbox';
  return environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
    : 'https://quickbooks.api.intuit.com/v3/company';
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function ensureAccessToken(tokens: Tokens): Promise<Tokens> {
  const aboutToExpire = !tokens.expires_at || Date.now() > tokens.expires_at - 120_000;
  if (!aboutToExpire) return tokens;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const basic = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');

  const r = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params,
  });

  const text = await r.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}

  if (!r.ok) {
    console.error('[QBO][refresh_failed]', r.status, text);
    throw j({ error: 'refresh_failed' }, 401);
  }

  const expiresInSec = Number(json.expires_in ?? 3600);
  const updated: Tokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? tokens.refresh_token,
    realm_id: tokens.realm_id,
    token_type: json.token_type ?? 'Bearer',
    expires_at: Date.now() + expiresInSec * 1000,
  };
  await saveTokens(updated);
  return updated;
}

async function qboQuery(tokens: Tokens, sql: string, minor = '65'): Promise<any> {
  const qboBase = getQboBaseUrl();
  const url = `${qboBase}/${tokens.realm_id}/query?query=${encodeURIComponent(sql)}&minorversion=${minor}`;
  const doFetch = async (accessToken: string) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/text',
      },
    });

  let res = await doFetch(tokens.access_token);
  if (res.status === 401) {
    const t = await ensureAccessToken(tokens);
    res = await doFetch(t.access_token);
  }

  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    console.error('[QBO][query_failed]', res.status, text.slice(0, 400));
    throw j({ error: 'qbo_query_failed', status: res.status }, res.status);
  }
  return data;
}

export async function POST(req: Request) {
  try {
    const tokens = await getLatestTokens();
    if (!tokens?.realm_id) {
      return j({ error: 'not_connected', detail: 'No realm_id/tokens found.' }, 401);
    }

    const valid = await ensureAccessToken(tokens);

    // Fetch ALL accounts (active) without any type filter to ensure we get everything
    const sql = `
      SELECT Id, Name, AcctNum, FullyQualifiedName, AccountType, AccountSubType, Classification, Active
      FROM Account
      WHERE Active = true
      MAXRESULTS 1000
    `.trim();

    const data = await qboQuery(valid, sql);
    const accounts = data?.QueryResponse?.Account ?? [];

    console.log(`[QBO][SYNC] Fetched ${accounts.length} total accounts from QBO`);

    // Build the hierarchical account paths for chart_of_accounts.json
    const accountPaths: string[] = [];
    
    for (const acc of accounts) {
      const fullPath = acc.FullyQualifiedName || acc.Name;
      // Format with account number prefix if available
      const formattedPath = acc.AcctNum ? `${acc.AcctNum} ${fullPath}` : fullPath;
      accountPaths.push(formattedPath);
    }

    // Sort alphabetically
    accountPaths.sort();

    // Save to chart_of_accounts.json
    const chartPath = path.join(process.cwd(), 'pcs_ai_data', 'chart_of_accounts.json');
    fs.mkdirSync(path.dirname(chartPath), { recursive: true });
    fs.writeFileSync(chartPath, JSON.stringify(accountPaths, null, 2));

    console.log(`[QBO][SYNC] Saved ${accountPaths.length} accounts to chart_of_accounts.json`);

    // Also categorize for reporting
    const byType: Record<string, number> = {};
    for (const acc of accounts) {
      const type = acc.AccountType || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    return j({
      success: true,
      message: `Synced ${accountPaths.length} accounts from QuickBooks`,
      totalAccounts: accounts.length,
      savedToFile: chartPath,
      byType,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    const msg = err?.detail || err?.message || String(err);
    console.error('[QBO][sync-accounts] fatal', msg);
    return j({ error: 'internal_error', detail: msg }, 500);
  }
}

export async function GET() {
  // Return info about the current chart of accounts
  try {
    const chartPath = path.join(process.cwd(), 'pcs_ai_data', 'chart_of_accounts.json');
    
    if (!fs.existsSync(chartPath)) {
      return j({ 
        exists: false, 
        message: 'chart_of_accounts.json does not exist. POST to this endpoint to sync from QBO.' 
      });
    }

    const content = fs.readFileSync(chartPath, 'utf8');
    const accounts = JSON.parse(content);
    
    return j({
      exists: true,
      count: accounts.length,
      lastModified: fs.statSync(chartPath).mtime.toISOString(),
      sampleAccounts: accounts.slice(0, 10),
    });
  } catch (err: any) {
    return j({ error: 'Failed to read chart_of_accounts.json', detail: err?.message }, 500);
  }
}
