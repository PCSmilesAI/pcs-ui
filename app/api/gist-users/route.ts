import { NextResponse, NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';

export const dynamic = 'force-dynamic';

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const RAW_FALLBACK_URL = `https://gist.githubusercontent.com/PCSmilesAI/${GIST_ID}/raw/${GIST_FILENAME}`;

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'pcs-ui-nextjs'
  };
  if (GITHUB_TOKEN) {
    h['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return h;
}

async function fetchUsersFromGist(): Promise<unknown> {
  // First attempt: with headers (possibly including token)
  let res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'GET',
    headers: buildHeaders(),
    cache: 'no-store'
  });

  // If unauthorized (bad token), retry without Authorization header
  if (res.status === 401 || res.status === 403) {
    const h: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'pcs-ui-nextjs' };
    res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'GET',
      headers: h,
      cache: 'no-store'
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch gist: ${res.status} ${res.statusText}`);
  }

  const data: any = await res.json();
  const file = data?.files?.[GIST_FILENAME];
  if (!file) {
    throw new Error(`Gist file ${GIST_FILENAME} not found`);
  }

  // Prefer inline content; fallback to raw_url if needed
  if (typeof file.content === 'string' && file.content.length > 0) {
    return JSON.parse(file.content);
  }
  if (typeof file.raw_url === 'string' && file.raw_url) {
    const rawRes = await fetch(file.raw_url, {
      method: 'GET',
      headers: { 'User-Agent': 'pcs-ui-nextjs' },
      cache: 'no-store'
    });
    if (!rawRes.ok) {
      throw new Error(`Failed to fetch gist raw: ${rawRes.status} ${rawRes.statusText}`);
    }
    const text = await rawRes.text();
    return JSON.parse(text);
  }

  throw new Error('Gist did not include content or raw_url');
}

export async function GET(req: NextRequest) {
  // SECURITY: Require authentication for user data access
  const user = getCurrentUser(req);
  if (!user.email) {
    console.warn('[API][GIST-USERS] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    try {
      const users = await fetchUsersFromGist();
      return NextResponse.json(users);
    } catch (primaryErr: any) {
      // Final fallback: hit the stable raw URL without API auth
      const rawRes = await fetch(RAW_FALLBACK_URL, {
        method: 'GET',
        headers: { 'User-Agent': 'pcs-ui-nextjs' },
        cache: 'no-store'
      });
      if (!rawRes.ok) {
        throw primaryErr; // bubble original
      }
      const text = await rawRes.text();
      const users = JSON.parse(text);
      return NextResponse.json(users);
    }
  } catch (error: any) {
    console.error('Error fetching users from Gist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
