/**
 * Rate Limit Middleware
 * 
 * Applies rate limiting to API requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimitByIP, rateLimitByUser, rateLimitByEndpoint } from './rateLimiter';

/**
 * Get client IP from request
 */
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Rate limit middleware by IP
 */
export function rateLimitIPMiddleware(
  maxRequests: number = 100,
  windowSeconds: number = 60
) {
  return (req: NextRequest): NextResponse | null => {
    const ip = getClientIP(req);
    const result = rateLimitByIP(ip, { maxRequests, windowSeconds });

    if (!result.allowed) {
      console.warn('[RATELIMIT] IP rate limit exceeded:', { ip });
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(result.resetAt),
          },
        }
      );
    }

    return null;
  };
}

/**
 * Rate limit middleware by user
 */
export function rateLimitUserMiddleware(
  email: string,
  maxRequests: number = 1000,
  windowSeconds: number = 60
) {
  return (req: NextRequest): NextResponse | null => {
    const result = rateLimitByUser(email, { maxRequests, windowSeconds });

    if (!result.allowed) {
      console.warn('[RATELIMIT] User rate limit exceeded:', { email });
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(result.resetAt),
          },
        }
      );
    }

    return null;
  };
}

/**
 * Rate limit middleware by endpoint
 */
export function rateLimitEndpointMiddleware(
  endpoint: string,
  identifier: string,
  maxRequests: number = 500,
  windowSeconds: number = 60
) {
  return (req: NextRequest): NextResponse | null => {
    const result = rateLimitByEndpoint(endpoint, identifier, {
      maxRequests,
      windowSeconds,
    });

    if (!result.allowed) {
      console.warn('[RATELIMIT] Endpoint rate limit exceeded:', {
        endpoint,
        identifier,
      });
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(result.resetAt),
          },
        }
      );
    }

    return null;
  };
}

/**
 * Compose multiple rate limit middlewares
 */
export function composeRateLimitMiddleware(
  ...middlewares: Array<(req: NextRequest) => NextResponse | null>
) {
  return (req: NextRequest): NextResponse | null => {
    for (const middleware of middlewares) {
      const result = middleware(req);
      if (result) return result;
    }
    return null;
  };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  resetAt: number
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', String(resetAt));
  
  return response;
}

