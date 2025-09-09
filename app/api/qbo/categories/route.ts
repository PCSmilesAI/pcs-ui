export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

type TokenRow = {
  realm_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number; // epoch seconds
};

const DB_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db');

function openDb() {
  // Ensure folder exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new Database(DB_PATH);
}

function getLatestTokens(): TokenRow | null {
  const db = openDb();
  const row = db
    .prepare(
      'SELECT realm_id, access_token, refresh_token, expires_at FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1'
    )
    .get() as TokenRow | undefined;
  db.close();
  return row ?? null;
}

async function refreshIfNeeded(row: TokenRow): Promise<TokenRow> {
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at > now + 60) {
    return row; // still valid
  }
  if (!row.refresh_token) {
    throw new Error('No refresh_token on file; please reconnect QuickBooks.');
  }

  const tokenResp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${process.env.QBO_CLIENT_ID!}:${process.env.QBO_CLIENT_SECRET!}`).toString(
          'base64'
        ),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });

  if (!tokenResp.ok) {
    const detail = await tokenResp.text();
    throw new Error(`Refresh failed: ${detail}`);
  }

  const tok = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const updated: TokenRow = {
    ...row,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600),
  };

  const db = openDb();
  db.prepare(
    `INSERT OR REPLACE INTO qbo_tokens (realm_id, access_token, refresh_token, expires_in, expires_at, updated_at)
     VALUES (@realm_id, @access_token, @refresh_token, @expires_in, @expires_at, strftime('%s','now'))`
  ).run({
    ...updated,
    expires_in: tok.expires_in ?? 3600
  });
  db.close();

  return updated;
}

function qboBaseUrl(env = process.env.QBO_ENV || 'production') {
  // Data API base is quickbooks.api.intuit.com for *both*; auth differs, but data is same host w/ realm switch
  return 'https://quickbooks.api.intuit.com';
}

export async function GET() {
  try {
    const row = getLatestTokens();
    if (!row) {
      return Response.json({ error: 'QuickBooks not connected' }, { status: 401 });
    }
    if (!row.realm_id) {
      return Response.json(
        { error: 'No realm_id on file; reconnect and select a company.' },
        { status: 400 }
      );
    }

    const valid = await refreshIfNeeded(row);

    const url = new URL(
      `/v3/company/${encodeURIComponent(row.realm_id)}/query`,
      qboBaseUrl()
    );
    // QBO query for Item categories
    url.searchParams.set('query', "select * from Item where Type = 'Category'");
    url.searchParams.set('minorversion', '73'); // safe current minor

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${valid.access_token}`,
        Accept: 'application/json',
        'Content-Type': 'application/text', // QBO likes text/plain or application/text for queries
      },
      method: 'GET',
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return Response.json({ error: 'QBO query failed', detail }, { status: 502 });
    }

    const data = (await resp.json()) as any;
    const items = data?.QueryResponse?.Item || [];

    // Normalize a compact list
    const categories = items.map((it: any) => ({
      id: it.Id,
      name: it.Name,
      parentRef: it.ParentRef?.value ?? null,
      fullyQualifiedName: it.FullyQualifiedName ?? it.Name,
    }));

    return Response.json({ categories });
  } catch (err: any) {
    // Surface root cause to logs and UI
    console.error('[QBO][categories] error:', err?.stack || err);
    return Response.json(
      { error: 'QuickBooks connection failed. Please reconnect.', detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}