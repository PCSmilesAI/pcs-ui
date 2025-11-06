import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Deprecated: This endpoint now delegates to /api/invoices/transition-db
 * which uses the SQLite database instead of JSON files.
 * Kept for backward compatibility.
 */
export async function POST(req: NextRequest) {
  // Delegate to the database-backed endpoint
  const url = new URL(req.url);
  url.pathname = '/api/invoices/transition-db';
  // Keep query parameters (e.g., email for authentication)

  // Read the body once
  const body = await req.json();
  const bodyString = JSON.stringify(body);

  // Forward to transition-db using fetch with duplex option
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Forward cookies for authentication
      'Cookie': req.headers.get('cookie') || '',
    },
    body: bodyString,
    duplex: 'half',
  } as any);

  return response;
}
