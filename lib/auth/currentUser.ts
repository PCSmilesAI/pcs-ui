import type { NextRequest } from 'next/server';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pacificcrestsmiles.com',
]);

function normaliseEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

function parseCookieValue(raw: string): { email?: string; name?: string } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
      };
    }
  } catch (_) {
    // cookie might not be JSON; fall back to raw string
  }

  const parts = raw.split('|');
  if (parts.length === 2) {
    return { name: parts[0], email: parts[1] };
  }
  return { email: raw };
}

export interface CurrentUser {
  email: string;
  name: string;
  isAdmin: boolean;
}

export function getCurrentUser(req: NextRequest): CurrentUser {
  let email = '';
  let name = '';

  const cookieCandidates = ['pcs_user', 'loggedInUser'];
  for (const key of cookieCandidates) {
    const cookie = req.cookies.get(key);
    if (cookie?.value) {
      const parsed = parseCookieValue(cookie.value);
      if (parsed.email) {
        email = parsed.email;
      }
      if (parsed.name) {
        name = parsed.name;
      }
      if (email) break;
    }
  }

  if (!email) {
    const formEmail = req.nextUrl.searchParams.get('email');
    if (formEmail) {
      email = formEmail;
    }
  }

  const normalisedEmail = normaliseEmail(email);
  const isAdmin = normalisedEmail ? ADMIN_EMAILS.has(normalisedEmail) : false;

  return {
    email: normalisedEmail,
    name: name || normalisedEmail || 'unknown',
    isAdmin,
  };
}
