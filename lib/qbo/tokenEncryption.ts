import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = 'pcs-qbo-token-v1';

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) return null;
  return scryptSync(raw, SALT, 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: base64(iv + tag + ciphertext) prefixed with "enc:" marker
  const combined = Buffer.concat([iv, tag, encrypted]);
  return `enc:${combined.toString('base64')}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith('enc:')) {
    return value;
  }

  const key = getKey();
  if (!key) {
    console.warn('[QBO][CRYPTO] Encrypted token found but ENCRYPTION_KEY not set');
    return value;
  }

  try {
    const combined = Buffer.from(value.slice(4), 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[QBO][CRYPTO] Decryption failed, returning raw value');
    return value;
  }
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}
