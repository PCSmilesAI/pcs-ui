const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, 'pcs_ai_data', 'qbo_tokens.db');
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
    // Save or update tokens
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
            
            db.run(query, [
                tokens.realmId,
                tokens.access_token,
                tokens.refresh_token,
                tokens.expires_at
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    // Get tokens by realm ID
    async getTokens(realmId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens WHERE realm_id = ?',
                [realmId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Get the most recent token
    async getLatestTokens() {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
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
