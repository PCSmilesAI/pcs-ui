import { Database } from 'sqlite3';

export interface QBOTokens {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtained_at?: number; // Optional: add this if you want to track token fetch time
}

class TokenStorage {
  private db: Database;

  constructor() {
    this.db = new Database('./pcs_ai_data/qbo_tokens.db');
    this.initDatabase();
  }

  private initDatabase() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS qbo_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        realm_id TEXT UNIQUE NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_in INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        obtained_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `;
    this.db.run(createTableSQL);
    
    // Add migration to add missing columns if they don't exist
    this.migrateDatabase();
  }

  private migrateDatabase() {
    // Check if expires_in column exists, if not add it
    this.db.get("PRAGMA table_info(qbo_tokens)", (err, row) => {
      if (err) {
        console.error('Error checking table schema:', err);
        return;
      }
      
      // Get all columns
      this.db.all("PRAGMA table_info(qbo_tokens)", (err, columns: any[]) => {
        if (err) {
          console.error('Error getting table columns:', err);
          return;
        }
        
        const columnNames = columns.map(col => col.name);
        
        // Add missing columns
        if (!columnNames.includes('expires_in')) {
          console.log('Adding expires_in column...');
          this.db.run(
            "ALTER TABLE qbo_tokens ADD COLUMN expires_in INTEGER DEFAULT 3600",
            (alterErr) => {
              // Ignore race conditions where another worker already added the column
              if (alterErr && !/duplicate column name/i.test(String(alterErr.message))) {
                console.error('Failed adding expires_in column:', alterErr);
              }
            }
          );
        }
        
        if (!columnNames.includes('obtained_at')) {
          console.log('Adding obtained_at column...');
          this.db.run(
            "ALTER TABLE qbo_tokens ADD COLUMN obtained_at INTEGER DEFAULT (strftime('%s','now'))",
            (alterErr) => {
              if (alterErr && !/duplicate column name/i.test(String(alterErr.message))) {
                console.error('Failed adding obtained_at column:', alterErr);
              }
            }
          );
        }

        // Add expires_at column if it doesn't exist
        if (!columnNames.includes('expires_at')) {
          console.log('Adding expires_at column...');
          this.db.run(
            "ALTER TABLE qbo_tokens ADD COLUMN expires_at INTEGER DEFAULT NULL",
            (alterErr) => {
              if (alterErr && !/duplicate column name/i.test(String(alterErr.message))) {
                console.error('Failed adding expires_at column:', alterErr);
              }
            }
          );
        }
      });
    });
  }

  async saveTokens(tokens: QBOTokens): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO qbo_tokens 
        (realm_id, access_token, refresh_token, expires_in, updated_at, obtained_at, expires_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
      `;
      const obtainedAt = tokens.obtained_at || Math.floor(Date.now() / 1000);
      const expiresAt = obtainedAt + tokens.expiresIn;
      this.db.run(sql, [
        tokens.realmId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        obtainedAt,
        expiresAt
      ], (err) => {
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

  async getTokens(realmId: string): Promise<QBOTokens | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM qbo_tokens WHERE realm_id = ?';
      this.db.get(sql, [realmId], (err, row: any) => {
        if (err) {
          console.error('Error getting QBO tokens:', err);
          reject(err);
        } else if (row) {
          resolve({
            realmId: row.realm_id,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            expiresIn: row.expires_in,
            obtained_at: row.obtained_at
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async getAllTokens(): Promise<QBOTokens[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM qbo_tokens ORDER BY updated_at DESC';
      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error getting all QBO tokens:', err);
          reject(err);
        } else {
          const tokens = rows.map(row => ({
            realmId: row.realm_id,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            expiresIn: row.expires_in,
            obtained_at: row.obtained_at
          }));
          resolve(tokens);
        }
      });
    });
  }

  async getLatestTokens(): Promise<QBOTokens | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1';
      this.db.get(sql, [], (err, row: any) => {
        if (err) {
          console.error('Error getting latest QBO tokens:', err);
          reject(err);
        } else if (row) {
          resolve({
            realmId: row.realm_id,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            expiresIn: row.expires_in,
            obtained_at: row.obtained_at
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  isTokenExpired(tokens: QBOTokens): boolean {
    const { expiresIn } = tokens;
    // Use obtained_at if present, otherwise assume token is expired for safety
    const obtainedAt = tokens.obtained_at || 0;
    if (obtainedAt === 0) {
      console.warn('⚠️ No obtained_at timestamp found, considering token expired');
      return true;
    }
    const expiryTime = obtainedAt + expiresIn;
    const currentTime = Math.floor(Date.now() / 1000);
    // Consider expired if within 2 minutes of expiry
    return currentTime > (expiryTime - 120);
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
}

export const tokenStorage = new TokenStorage();

// Export standalone functions for easier use
export async function saveTokens(realmId: string, tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number;
}): Promise<void> {
  return tokenStorage.saveTokens({
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    obtained_at: tokens.obtained_at
  });
}

export async function getTokens(realmId: string): Promise<QBOTokens | null> {
  return tokenStorage.getTokens(realmId);
}

export async function getAllTokens(): Promise<QBOTokens[]> {
  return tokenStorage.getAllTokens();
}

export async function getLatestTokens(): Promise<QBOTokens | null> {
  return tokenStorage.getLatestTokens();
}
