import crypto from 'crypto';

// base64url helpers
const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function hmac(data: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

export type StatePayload = {
  iat: number;          // issued at (seconds)
  exp: number;          // expires at (seconds) – e.g. now + 10 min
  nonce: string;        // random nonce for debugging/correlation
  code_verifier: string;
  redirect_uri: string; // echo back what we used
};

export function signState(payload: StatePayload, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const toSign = `${h}.${p}`;
  const sig = b64url(hmac(toSign, secret));
  return `${toSign}.${sig}`;
}

export function verifyState(token: string, secret: string): StatePayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(hmac(`${h}.${p}`, secret));
  if (s !== expected) return null;
  const payload = JSON.parse(unb64url(p).toString('utf8')) as StatePayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  return payload;
}
