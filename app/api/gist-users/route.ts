import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// DISABLED: This endpoint previously synced user data to a public GitHub Gist,
// exposing credentials. User authentication now uses local database only.
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'This endpoint has been disabled for security reasons. Use local auth.' },
    { status: 410 }
  );
}
