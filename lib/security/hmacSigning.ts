/**
 * HMAC Request Signing
 * 
 * Implements HMAC-SHA256 signing for API requests
 * Provides authentication and integrity verification
 */

import { createHmac, randomBytes } from 'crypto';

const HMAC_ALGORITHM = 'sha256';
const HMAC_HEADER = 'x-signature';
const NONCE_HEADER = 'x-nonce';
const TIMESTAMP_HEADER = 'x-timestamp';

/**
 * Generate a nonce (random value)
 */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Get current timestamp
 */
export function getCurrentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Create HMAC signature
 */
export function createSignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  nonce: string,
  timestamp: string
): string {
  const message = `${method}\n${path}\n${body}\n${nonce}\n${timestamp}`;
  
  const hmac = createHmac(HMAC_ALGORITHM, secret);
  hmac.update(message);
  
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifySignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  nonce: string,
  timestamp: string,
  signature: string,
  maxAgeSeconds: number = 300 // 5 minutes
): boolean {
  // Check timestamp is not too old
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  
  if (isNaN(requestTime) || now - requestTime > maxAgeSeconds) {
    console.warn('[HMAC] Request timestamp too old or invalid:', {
      requestTime,
      now,
      age: now - requestTime,
    });
    return false;
  }

  // Verify signature
  const expectedSignature = createSignature(
    secret,
    method,
    path,
    body,
    nonce,
    timestamp
  );

  const isValid = expectedSignature === signature;
  
  if (!isValid) {
    console.warn('[HMAC] Signature verification failed');
  }

  return isValid;
}

/**
 * Sign a request (for client)
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string = ''
): {
  signature: string;
  nonce: string;
  timestamp: string;
} {
  const nonce = generateNonce();
  const timestamp = getCurrentTimestamp();
  const signature = createSignature(secret, method, path, body, nonce, timestamp);

  return { signature, nonce, timestamp };
}

/**
 * Add signature headers to request
 */
export function addSignatureHeaders(
  headers: Record<string, string>,
  secret: string,
  method: string,
  path: string,
  body: string = ''
): Record<string, string> {
  const { signature, nonce, timestamp } = signRequest(secret, method, path, body);

  return {
    ...headers,
    [HMAC_HEADER]: signature,
    [NONCE_HEADER]: nonce,
    [TIMESTAMP_HEADER]: timestamp,
  };
}

/**
 * Extract signature from request headers
 */
export function extractSignatureHeaders(headers: Record<string, string>): {
  signature: string | null;
  nonce: string | null;
  timestamp: string | null;
} {
  return {
    signature: headers[HMAC_HEADER] || null,
    nonce: headers[NONCE_HEADER] || null,
    timestamp: headers[TIMESTAMP_HEADER] || null,
  };
}

/**
 * Verify request signature from headers
 */
export function verifyRequestSignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  maxAgeSeconds?: number
): boolean {
  const { signature, nonce, timestamp } = extractSignatureHeaders(headers);

  if (!signature || !nonce || !timestamp) {
    console.warn('[HMAC] Missing signature headers');
    return false;
  }

  return verifySignature(
    secret,
    method,
    path,
    body,
    nonce,
    timestamp,
    signature,
    maxAgeSeconds
  );
}

/**
 * Create a signed API key pair
 */
export function createAPIKeyPair(): {
  publicKey: string;
  secretKey: string;
} {
  const publicKey = randomBytes(16).toString('hex');
  const secretKey = randomBytes(32).toString('hex');

  return { publicKey, secretKey };
}

