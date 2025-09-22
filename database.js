const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes
const IV_LENGTH = 12;

const encryptionKeyBuffer = (() => {
    if (typeof ENCRYPTION_KEY !== 'string' || ENCRYPTION_KEY.length === 0) {
        console.warn('[QBO] ENCRYPTION_KEY not set. QuickBooks tokens will be stored without encryption.');
        return null;
    }

    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'utf8');
    if (keyBuffer.length !== 32) {
        console.warn(
            '[QBO] ENCRYPTION_KEY must be exactly 32 bytes. Falling back to storing QuickBooks tokens in plaintext.'
        );
        return null;
    }

    return keyBuffer;
})();

const encryptionEnabled = !!encryptionKeyBuffer;

function isEncryptedPayload(value) {
    if (typeof value !== 'string') return false;
    const parts = value.split(':');
    return (
        parts.length === 3 &&
        parts.every((part) => part.length > 0 && /^[0-9a-f]+$/i.test(part))
    );
}

// Encryption helpers
function encrypt(text) {
    if (!encryptionEnabled) {
        return text;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(algorithm, encryptionKeyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(data) {
    if (!encryptionEnabled) {
        return data;
    }
    const [ivHex, tagHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, encryptionKeyBuffer, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function maybeDecrypt(label, value) {
    if (!encryptionEnabled) {
        return value;
    }

    if (!isEncryptedPayload(value)) {
        if (typeof value === 'string' && value.length > 0) {
            console.warn(`[QBO] ${label} stored without encryption. Returning raw value.`);
        }
        return value;
    }

    try {
        return decrypt(value);
    } catch (error) {
        console.error(`[QBO] Failed to decrypt stored ${label}:`, error);
        throw error;
    }
}

// Create database connection
const projectRoot = process.cwd();
const preferredDir = path.join(projectRoot, 'pcs_ai_data');
const legacyDir = path.join(__dirname, 'pcs_ai_data');

// Prefer storing tokens relative to the project root so the location is stable
// when this module is bundled into Next.js server output. Fall back to the
// legacy __dirname path if that database already exists (for backwards
// compatibility with older services that required this file directly).
let dbDirectory = preferredDir;
const preferredPath = path.join(preferredDir, 'qbo_tokens.db');
const legacyPath = path.join(legacyDir, 'qbo_tokens.db');

if (!preferredDir.startsWith(legacyDir) && fs.existsSync(legacyPath) && !fs.existsSync(preferredPath)) {
    dbDirectory = legacyDir;
}

fs.mkdirSync(dbDirectory, { recursive: true });
const dbPath = path.join(dbDirectory, 'qbo_tokens.db');
console.log(`[QBO] Token database path: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

// Initialize database schema
db.serialize(() => {
    // Create tokens table
    db.run(`
        CREATE TABLE IF NOT EXISTS qbo_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            realm_id TEXT UNIQUE NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    // Create company info table
    db.run(`
        CREATE TABLE IF NOT EXISTS company_info (
            realm_id TEXT PRIMARY KEY,
            company_name TEXT,
            email TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);
});

// Token management functions
const tokenManager = {
    // Save or update tokens (now encrypted)
    async saveTokens(tokens) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO qbo_tokens (realm_id, access_token, refresh_token, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(realm_id) 
                DO UPDATE SET 
                    access_token = excluded.access_token,
                    refresh_token = excluded.refresh_token,
                    expires_at = excluded.expires_at,
                    updated_at = strftime('%s', 'now')
            `;

            // Encrypt the access and refresh tokens before saving
            const encryptedAccessToken = encrypt(tokens.access_token);
            const encryptedRefreshToken = encrypt(tokens.refresh_token);

            db.run(query, [
                tokens.realmId,
                encryptedAccessToken,
                encryptedRefreshToken,
                tokens.expires_at
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    // Get tokens by realm ID (decrypt before returning)
    async getTokens(realmId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens WHERE realm_id = ?',
                [realmId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else {
                        try {
                            row.access_token = maybeDecrypt('access token', row.access_token);
                            row.refresh_token = maybeDecrypt('refresh token', row.refresh_token);
                            resolve(row);
                        } catch (e) {
                            reject(e);
                        }
                    }
                }
            );
        });
    },

    // Get the most recent token (decrypt before returning)
    async getLatestTokens() {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1',
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else {
                        try {
                            row.access_token = maybeDecrypt('access token', row.access_token);
                            row.refresh_token = maybeDecrypt('refresh token', row.refresh_token);
                            resolve(row);
                        } catch (e) {
                            reject(e);
                        }
                    }
                }
            );
        });
    },

    async getAllTokens() {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM qbo_tokens',
                (err, rows = []) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    try {
                        const decryptedRows = rows.map((row) => ({
                            ...row,
                            access_token: maybeDecrypt('access token', row.access_token),
                            refresh_token: maybeDecrypt('refresh token', row.refresh_token),
                        }));
                        resolve(decryptedRows);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    },

    // Delete tokens
    async deleteTokens(realmId) {
        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM qbo_tokens WHERE realm_id = ?',
                [realmId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    },

    // Check if tokens exist
    async hasTokens() {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM qbo_tokens',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count > 0);
                }
            );
        });
    }
};

module.exports = {
    db,
    tokenManager
};
