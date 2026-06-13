import { Database } from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from './tokenEncryption';

export interface QBOTokens {
  realmId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number; // seconds
  expiresAt: number; // epoch seconds
}

const LEGACY_JSON_CANDIDATES = [
  path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.json'),
  path.resolve(process.cwd(), 'qbo_tokens.json'),
  path.resolve(process.cwd(), '.secrets/qbo_tokens.json'),
];

type RawTokenRow = {
  realm_id?: string;
  realmId?: string;
  access_token?: string;
  accessToken?: string;
  refresh_token?: string | null;
  refreshToken?: string | null;
  expires_in?: number | string | null;
  expiresIn?: number | string | null;
  expires_at?: number | string | null;
  expiresAt?: number | string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeRow(row: RawTokenRow | null | undefined): QBOTokens | null {
  if (!row) return null;

  const realmId = row.realmId ?? row.realm_id;
  const rawAccessToken = row.accessToken ?? row.access_token;
  if (!realmId || !rawAccessToken) return null;

  const accessToken = decrypt(rawAccessToken);
  const rawRefresh = row.refreshToken ?? row.refresh_token ?? null;
  const refreshToken = rawRefresh ? decrypt(rawRefresh) : null;
  const expiresInRaw = toNumber(row.expiresIn ?? row.expires_in);
  const expiresAtRaw = toNumber(row.expiresAt ?? row.expires_at);
  const now = Math.floor(Date.now() / 1000);

  let expiresAt = expiresAtRaw ?? null;
  if (typeof expiresAt === 'number' && expiresAt > 1e12) {
    expiresAt = Math.floor(expiresAt / 1000);
  }
  if (expiresAt === null) {
    const inferredExpiresIn = expiresInRaw ?? 3600;
    expiresAt = now + inferredExpiresIn;
  }

  const expiresIn = expiresInRaw ?? Math.max(0, expiresAt - now);

  return {
    realmId,
    accessToken,
    refreshToken,
    expiresIn,
    expiresAt,
  };
}

type JsonTokenPayload = RawTokenRow & {
  accessToken?: string;
  refreshToken?: string | null;
  realmId?: string;
  expiresAt?: number | string | null;
  expiresIn?: number | string | null;
  // Legacy/alternate casing keys we might see in JSON files
  RealmId?: string;
  realmID?: string;
  access_token?: string;
  refresh_token?: string | null;
  expires_at?: number | string | null;
  tokens?: JsonTokenPayload[];
};

function extractJsonTokens(payload: JsonTokenPayload | JsonTokenPayload[] | null | undefined): QBOTokens[] {
  if (!payload) return [];

  const entries: JsonTokenPayload[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.tokens)
      ? payload.tokens
      : [payload];

  return entries
    .map((entry) => {
      const row: RawTokenRow = {
        realmId: entry.realmId ?? entry.RealmId ?? entry.realmID,
        realm_id: entry.realm_id,
        accessToken: entry.accessToken,
        access_token: entry.access_token,
        refreshToken: entry.refreshToken,
        refresh_token: entry.refresh_token,
        expiresAt: (entry.expiresAt as number | string | null | undefined) ?? entry.expires_at,
        expires_at: entry.expires_at,
        expiresIn: entry.expiresIn,
        expires_in: entry.expires_in,
      };

      const normalized = normalizeRow(row);
      if (normalized) {
        return normalized;
      }

      const fallbackRow: RawTokenRow = {
        realmId: row.realmId ?? row.realm_id,
        access_token: row.accessToken ?? row.access_token,
        refresh_token: row.refreshToken ?? row.refresh_token,
        expires_at: row.expiresAt ?? row.expires_at,
        expires_in: row.expiresIn ?? row.expires_in,
      };

      return normalizeRow(fallbackRow);
    })
    .filter((token): token is QBOTokens => token !== null);
}

function loadLegacyJsonTokens(preferredPath: string | null): { tokens: QBOTokens[]; path: string | null } {
  const tried = new Set<string>();
  const orderedCandidates = preferredPath
    ? [preferredPath, ...LEGACY_JSON_CANDIDATES.filter((candidate) => candidate !== preferredPath)]
    : LEGACY_JSON_CANDIDATES;

  for (const candidate of orderedCandidates) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);

    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf8');
      if (!raw.trim()) continue;

      const parsed = JSON.parse(raw) as JsonTokenPayload | JsonTokenPayload[];
      const tokens = extractJsonTokens(parsed);
      if (tokens.length > 0) {
        return { tokens, path: candidate };
      }
    } catch (error) {
      console.warn(`[QBO] Failed to read legacy QuickBooks token file at ${candidate}:`, error);
    }
  }

  return { tokens: [], path: preferredPath ?? null };
}

// The block below was duplicated due to a merge; keep the first definitions only.

class TokenStorage {
  private db: Database | null = null;

  private legacyManager: any = null;

  private useLegacyManager = false;

  private jsonTokenPath: string | null = null;

  private cachedJsonTokens: QBOTokens[] = [];

  constructor() {
    const hasEncryptionKey = typeof process.env.ENCRYPTION_KEY === 'string' && process.env.ENCRYPTION_KEY.length > 0;
    const preferLegacy = String(process.env.USE_LEGACY_QBO_TOKEN_MANAGER).toLowerCase() === 'true';

    if (preferLegacy && hasEncryptionKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const legacyModule = require('../../database');
        if (legacyModule?.tokenManager) {
          this.legacyManager = legacyModule.tokenManager;
          this.useLegacyManager = true;
          console.log('[QBO] Using encrypted legacy token manager for QuickBooks tokens');
        } else {
          console.warn('[QBO] Legacy token manager requested but not available. Falling back to SQLite storage.');
        }
      } catch (error) {
        console.warn('[QBO] Legacy token manager requested but failed to load. Falling back to SQLite storage.');
      }
    }

    if (!this.useLegacyManager) {
      const configuredPath = process.env.QBO_DB_PATH;
      const defaultPath = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db');
      const dbPath = configuredPath ? path.resolve(configuredPath) : defaultPath;
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      console.log('[QBO] Token DB path:', dbPath);
      this.db = new Database(dbPath);
      this.initDatabase();
    }

    const legacyJson = loadLegacyJsonTokens(null);
    if (legacyJson.tokens.length > 0) {
      this.cachedJsonTokens = legacyJson.tokens;
      this.jsonTokenPath = legacyJson.path;
      console.log(`[QBO] Loaded ${legacyJson.tokens.length} QuickBooks token(s) from legacy JSON storage.`);
    } else if (legacyJson.path) {
      this.jsonTokenPath = legacyJson.path;
    }
  }

  private initDatabase() {
    if (!this.db) return;

    this.db.serialize(() => {
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS qbo_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          realm_id TEXT UNIQUE NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_in INTEGER DEFAULT 3600,
          expires_at INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),
          obtained_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    });
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('QuickBooks token database is not initialized');
    }
    return this.db;
  }

  private ensureJsonPath(): string {
    if (this.jsonTokenPath) {
      return this.jsonTokenPath;
    }

    const legacy = loadLegacyJsonTokens(null);
    if (legacy.path) {
      this.cachedJsonTokens = legacy.tokens;
      this.jsonTokenPath = legacy.path;
      return legacy.path;
    }

    const fallbackPath = LEGACY_JSON_CANDIDATES[0];
    this.jsonTokenPath = fallbackPath;
    return fallbackPath;
  }

  private loadJsonTokens(force = false): QBOTokens[] {
    if (!force && this.cachedJsonTokens.length > 0) {
      return this.cachedJsonTokens;
    }

    const legacy = loadLegacyJsonTokens(this.jsonTokenPath);
    if (legacy.path) {
      this.jsonTokenPath = legacy.path;
    }
    this.cachedJsonTokens = legacy.tokens;
    return this.cachedJsonTokens;
  }

  private getLatestJsonToken(): QBOTokens | null {
    const tokens = this.loadJsonTokens();
    if (tokens.length === 0) return null;

    return tokens.reduce((latest, token) => {
      if (!latest) return token;
      return token.expiresAt > latest.expiresAt ? token : latest;
    }, tokens[0] as QBOTokens | null);
  }

  private syncJsonToken(token: QBOTokens | null): void {
    try {
      const target = this.ensureJsonPath();
      fs.mkdirSync(path.dirname(target), { recursive: true });

      if (token) {
        const payload = {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          realmId: token.realmId,
          expiresAt: token.expiresAt * 1000,
          expiresIn: token.expiresIn,
          tokenType: 'bearer',
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
        this.cachedJsonTokens = [token];
      } else {
        const payload = {
          accessToken: '',
          refreshToken: '',
          realmId: '',
          expiresAt: null,
          tokenType: 'bearer',
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
        this.cachedJsonTokens = [];
      }
    } catch (error) {
      console.warn('[QBO] Failed to sync legacy QuickBooks token JSON file:', error);
    }
  }

  async saveTokens({ realmId, accessToken, refreshToken, expiresIn }: { realmId: string; accessToken: string; refreshToken?: string | null; expiresIn: number; }): Promise<void> {
    const expiresInSeconds = Number(expiresIn || 3600);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresInSeconds;
    const refreshRaw = typeof refreshToken === 'string' ? refreshToken : refreshToken ?? '';
    const refresh = typeof refreshRaw === 'string' ? refreshRaw : '';

    if (this.useLegacyManager && this.legacyManager) {
      await this.legacyManager.saveTokens({
        realmId,
        access_token: accessToken,
        refresh_token: refresh,
        expires_at: expiresAt * 1000,
        expires_in: expiresInSeconds,
      });
      const normalized: QBOTokens = {
        realmId,
        accessToken,
        refreshToken: refresh.trim().length > 0 ? refresh : null,
        expiresAt,
        expiresIn: expiresInSeconds,
      };
      this.syncJsonToken(normalized);
      return;
    }

    const db = this.ensureDb();

    const encAccessToken = encrypt(accessToken);
    const encRefresh = encrypt(refresh);

    await new Promise<void>((resolve, reject) => {
      const sql = `
        INSERT INTO qbo_tokens (realm_id, access_token, refresh_token, expires_in, expires_at, updated_at, obtained_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(realm_id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_in = excluded.expires_in,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `;
      db.run(sql, [realmId, encAccessToken, encRefresh, expiresInSeconds, expiresAt, now, now], (err) => {
        if (err) {
          console.error('Error saving QBO tokens:', err);
          reject(err);
        } else {
          console.log('✅ QBO tokens saved successfully');
          const normalized = normalizeRow({
            realm_id: realmId,
            access_token: accessToken,
            refresh_token: refresh,
            expires_at: expiresAt,
            expires_in: expiresInSeconds,
          });
          this.syncJsonToken(normalized);
          resolve();
        }
      });
    });
  }

  async getTokens(realmId: string): Promise<QBOTokens | null> {
    if (this.useLegacyManager && this.legacyManager) {
      const row = await this.legacyManager.getTokens(realmId);
      const normalized = normalizeRow(row);
      if (normalized) {
        return normalized;
      }
      const fallbackTokens = this.loadJsonTokens();
      return fallbackTokens.find((token) => token.realmId === realmId) || fallbackTokens[0] || null;
    }

    const db = this.ensureDb();
    return new Promise<QBOTokens | null>((resolve, reject) => {
      db.get(
        'SELECT * FROM qbo_tokens WHERE realm_id = ?',
        [realmId],
        (err, row: RawTokenRow) => {
          if (err) {
            reject(err);
          } else {
            const normalized = normalizeRow(row);
            if (normalized) {
              resolve(normalized);
              return;
            }

            const fallbackTokens = this.loadJsonTokens();
            const match = fallbackTokens.find((token) => token.realmId === realmId) || fallbackTokens[0] || null;
            resolve(match ?? null);
          }
        },
      );
    });
  }

  async deleteTokens(realmId: string): Promise<void> {
    if (this.useLegacyManager && this.legacyManager) {
      await this.legacyManager.deleteTokens(realmId);
      this.syncJsonToken(null);
      return;
    }

    const db = this.ensureDb();
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM qbo_tokens WHERE realm_id = ?', [realmId], (err) => {
        if (err) {
          console.error('Error deleting QBO tokens:', err);
          reject(err);
        } else {
          console.log('✅ QBO tokens deleted successfully');
          this.syncJsonToken(null);
          resolve();
        }
      });
    });
  }

  async getAllTokens(): Promise<QBOTokens[]> {
    if (this.useLegacyManager && this.legacyManager) {
      const rows = await this.legacyManager.getAllTokens();
      const normalized = (rows || []).map((row: RawTokenRow) => normalizeRow(row)).filter((row): row is QBOTokens => row !== null);
      if (normalized.length > 0) {
        return normalized;
      }
      return this.loadJsonTokens();
    }

    const db = this.ensureDb();
    return new Promise<QBOTokens[]>((resolve, reject) => {
      db.all('SELECT * FROM qbo_tokens', [], (err, rows: RawTokenRow[]) => {
        if (err) {
          console.error('Error getting all QBO tokens:', err);
          reject(err);
        } else {
          let normalized = (rows || []).map((row) => normalizeRow(row)).filter((row): row is QBOTokens => row !== null);
          if (normalized.length === 0) {
            normalized = this.loadJsonTokens();
          }
          resolve(normalized);
        }
      });
    });
  }

  async getLatestTokens(): Promise<QBOTokens | null> {
    if (this.useLegacyManager && this.legacyManager) {
      const row = await this.legacyManager.getLatestTokens();
      const normalized = normalizeRow(row);
      if (normalized) {
        return normalized;
      }
      return this.getLatestJsonToken();
    }

    const db = this.ensureDb();
    return new Promise<QBOTokens | null>((resolve, reject) => {
      db.get('SELECT * FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1', [], (err, row: RawTokenRow) => {
        if (err) {
          console.error('Error getting latest QBO tokens:', err);
          reject(err);
        } else {
          const normalized = normalizeRow(row);
          if (normalized) {
            resolve(normalized);
            return;
          }

          resolve(this.getLatestJsonToken());
        }
      });
    });
  }

  isTokenExpired(tokens: QBOTokens): boolean {
    const { expiresAt } = tokens;
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime > (expiresAt - 120);
  }
}

export const tokenStorage = new TokenStorage();
