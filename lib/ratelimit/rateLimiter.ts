/**
 * Rate Limiting Service
 * 
 * Implements token bucket algorithm for rate limiting
 * Supports per-IP and per-user rate limiting
 */

import { getDatabase } from '../db/client';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Initialize rate limit table
 */
export function initRateLimiter(): void {
  const db = getDatabase();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      requests INTEGER DEFAULT 0,
      reset_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      INDEX idx_rate_limits_reset_at (reset_at)
    );
  `);
  
  console.log('[RATELIMIT] Rate limiter initialized');
}

/**
 * Check rate limit for a key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + config.windowSeconds;

  // Get or create rate limit record
  let record = db.prepare(
    'SELECT * FROM rate_limits WHERE key = ?'
  ).get(key) as any;

  if (!record || record.reset_at < now) {
    // Create new record or reset expired one
    db.prepare(`
      INSERT OR REPLACE INTO rate_limits (key, requests, reset_at)
      VALUES (?, ?, ?)
    `).run(key, 1, resetAt);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Increment request count
  const newCount = record.requests + 1;
  const allowed = newCount <= config.maxRequests;

  db.prepare(
    'UPDATE rate_limits SET requests = ? WHERE key = ?'
  ).run(newCount, key);

  const remaining = Math.max(0, config.maxRequests - newCount);
  const retryAfter = allowed ? undefined : record.reset_at - now;

  return {
    allowed,
    remaining,
    resetAt: record.reset_at,
    retryAfter,
  };
}

/**
 * Rate limit by IP address
 */
export function rateLimitByIP(
  ip: string,
  config: RateLimitConfig = {
    maxRequests: 100,
    windowSeconds: 60,
  }
): RateLimitResult {
  const key = `ip:${ip}`;
  return checkRateLimit(key, config);
}

/**
 * Rate limit by user email
 */
export function rateLimitByUser(
  email: string,
  config: RateLimitConfig = {
    maxRequests: 1000,
    windowSeconds: 60,
  }
): RateLimitResult {
  const key = `user:${email}`;
  return checkRateLimit(key, config);
}

/**
 * Rate limit by endpoint
 */
export function rateLimitByEndpoint(
  endpoint: string,
  identifier: string,
  config: RateLimitConfig = {
    maxRequests: 500,
    windowSeconds: 60,
  }
): RateLimitResult {
  const key = `endpoint:${endpoint}:${identifier}`;
  return checkRateLimit(key, config);
}

/**
 * Get rate limit status
 */
export function getRateLimitStatus(key: string): RateLimitResult | null {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const record = db.prepare(
    'SELECT * FROM rate_limits WHERE key = ?'
  ).get(key) as any;

  if (!record) return null;

  if (record.reset_at < now) {
    return null; // Expired
  }

  return {
    allowed: true,
    remaining: record.requests,
    resetAt: record.reset_at,
  };
}

/**
 * Reset rate limit for a key
 */
export function resetRateLimit(key: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
  console.log('[RATELIMIT] Reset rate limit for key:', key);
}

/**
 * Clean up expired rate limit records
 */
export function cleanupExpiredRateLimits(): number {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(
    'DELETE FROM rate_limits WHERE reset_at < ?'
  ).run(now);

  const deleted = result.changes;
  console.log(`[RATELIMIT] Cleaned up ${deleted} expired rate limit records`);
  
  return deleted;
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats(): {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
} {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM rate_limits'
  ).get() as any;

  const active = db.prepare(
    'SELECT COUNT(*) as count FROM rate_limits WHERE reset_at > ?'
  ).get(now) as any;

  return {
    totalKeys: total?.count || 0,
    activeKeys: active?.count || 0,
    expiredKeys: (total?.count || 0) - (active?.count || 0),
  };
}

