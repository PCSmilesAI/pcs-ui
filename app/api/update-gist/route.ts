import { NextRequest, NextResponse } from 'next/server';

// DISABLED: This endpoint previously wrote user credentials to a public GitHub Gist.
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'This endpoint has been disabled for security reasons.' },
    { status: 410 }
  );
}
