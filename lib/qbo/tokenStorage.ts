import { Database } from 'sqlite3';

export interface QBOTokens {
  realmId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;       // seconds
  expiresAt: number;       // epoch seconds
}

class TokenStorage {
  private db: Database;

  constructor() {
    this.db = new Database('./pcs_ai_data/qbo_tokens.db');
    this.initDatabase();
  }

  private initDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS qbo_tokens (
          realm_id TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_in INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  saveTokens({ realmId, accessToken, refreshToken, expiresIn }: { realmId: string; accessToken: string; refreshToken?: string | null; expiresIn: number; }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expires_at = now + Number(expiresIn || 3600);
    const ref = refreshToken ?? null;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO qbo_tokens (realm_id, access_token, refresh_token, expires_in, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(realm_id) DO UPDATE SET
          access_token=excluded.access_token,
          refresh_token=excluded.refresh_token,
          expires_in=excluded.expires_in,
          expires_at=excluded.expires_at,
          updated_at=excluded.updated_at
      `;
      this.db.run(sql, [realmId, accessToken, ref, expiresIn, expires_at, now], (err) => {
        if (err) {
          console.error('Error saving QBO tokens:', err);
          reject(err);
        } else {
          console.log('✅ QBO tokens saved successfully');
          resolve();
        }
      });
    });
  }

  getTokens(realmId: string): Promise<QBOTokens | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT realm_id as realmId, access_token as accessToken, refresh_token as refreshToken, expires_in as expiresIn, expires_at as expiresAt FROM qbo_tokens WHERE realm_id = ?',
        [realmId],
        (err, row: any) => {
          if (err) return reject(err);
          resolve(row || null);
        },
      );
    });
  }

  async deleteTokens(realmId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM qbo_tokens WHERE realm_id = ?';
      this.db.run(sql, [realmId], (err) => {
        if (err) {
          console.error('Error deleting QBO tokens:', err);
          reject(err);
        } else {
          console.log('✅ QBO tokens deleted successfully');
          resolve();
        }
      });
    });
  }

  async getAllTokens(): Promise<QBOTokens[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT realm_id as realmId, access_token as accessToken, refresh_token as refreshToken, expires_in as expiresIn, expires_at as expiresAt FROM qbo_tokens';
      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error getting all QBO tokens:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getLatestTokens(): Promise<QBOTokens | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT realm_id as realmId, access_token as accessToken, refresh_token as refreshToken, expires_in as expiresIn, expires_at as expiresAt FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1';
      this.db.get(sql, [], (err, row: any) => {
        if (err) {
          console.error('Error getting latest QBO tokens:', err);
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  isTokenExpired(tokens: QBOTokens): boolean {
    const { expiresAt } = tokens;
    const currentTime = Math.floor(Date.now() / 1000);
    // Consider expired if within 2 minutes of expiry
    return currentTime > (expiresAt - 120);
  }
}

export const tokenStorage = new TokenStorage();