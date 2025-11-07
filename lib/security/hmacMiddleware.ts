/**
 * HMAC Middleware
 * 
 * Validates HMAC signatures on API requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestSignature } from './hmacSigning';

/**
 * Get request body as string
 */
async function getRequestBody(req: NextRequest): Promise<string> {
  try {
    const body = await req.text();
    return body;
  } catch {
    return '';
  }
}

/**
 * Verify HMAC signature middleware
 */
export async function verifyHMACMiddleware(
  req: NextRequest,
  secret: string,
  maxAgeSeconds: number = 300
): Promise<NextResponse | null> {
  // Skip verification for GET requests
  if (req.method === 'GET') {
    return null;
  }

  // Get request details
  const method = req.method;
  const path = req.nextUrl.pathname;
  const body = await getRequestBody(req);
  
  // Extract headers
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Verify signature
  const isValid = verifyRequestSignature(
    secret,
    method,
    path,
    body,
    headers,
    maxAgeSeconds
  );

  if (!isValid) {
    console.error('[HMAC] Signature verification failed:', {
      method,
      path,
      ip: req.headers.get('x-forwarded-for'),
    });

    return NextResponse.json(
      { error: 'Invalid request signature' },
      { status: 401 }
    );
  }

  return null; // Signature valid
}

/**
 * Wrap a handler with HMAC verification
 */
export function withHMACVerification(
  handler: (req: NextRequest) => Promise<NextResponse>,
  secret: string,
  maxAgeSeconds: number = 300
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Verify HMAC signature
    const hmacError = await verifyHMACMiddleware(req, secret, maxAgeSeconds);
    if (hmacError) {
      return hmacError;
    }

    // Call handler
    return handler(req);
  };
}

/**
 * Exempt paths from HMAC verification
 */
export const HMAC_EXEMPT_PATHS = [
  '/api/health',
  '/api/ready',
  '/api/stripe/webhook',
  '/api/qbo/callback',
  '/api/qbo/webhooks',
];

/**
 * Check if path is exempt from HMAC verification
 */
export function isHMACExempt(pathname: string): boolean {
  return HMAC_EXEMPT_PATHS.some(p => pathname.startsWith(p));
}

/**
 * Conditional HMAC verification middleware
 */
export async function conditionalHMACMiddleware(
  req: NextRequest,
  secret: string,
  maxAgeSeconds: number = 300
): Promise<NextResponse | null> {
  // Skip verification for exempt paths
  if (isHMACExempt(req.nextUrl.pathname)) {
    return null;
  }

  // Skip verification for GET requests
  if (req.method === 'GET') {
    return null;
  }

  // Verify HMAC signature
  return verifyHMACMiddleware(req, secret, maxAgeSeconds);
}

