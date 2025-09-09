import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db');
console.log('[QBO] State DB path:', DB_PATH);

const db = new Database(DB_PATH);

// Ensure oauth_state table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_state (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export interface OAuthState {
  state: string;
  code_verifier: string;
  created_at: number;
}

export function insertState(stateData: OAuthState): void {
  const stmt = db.prepare(`
    INSERT INTO oauth_state (state, code_verifier, created_at)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(stateData.state, stateData.code_verifier, stateData.created_at);
  console.log('🔐 OAuth state stored:', stateData.state);
}

export function getStateAndDelete(state: string): OAuthState | null {
  const stmt = db.prepare(`
    SELECT state, code_verifier, created_at 
    FROM oauth_state 
    WHERE state = ?
  `);
  
  const row = stmt.get(state) as any;
  if (!row) {
    console.log('❌ OAuth state not found:', state);
    return null;
  }
  
  // Check if state is not too old (10 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - row.created_at > 600) {
    console.log('❌ OAuth state expired:', state);
    deleteState(state);
    return null;
  }
  
  // Delete the state after successful lookup
  deleteState(state);
  
  console.log('✅ OAuth state validated and deleted:', state);
  return {
    state: row.state,
    code_verifier: row.code_verifier,
    created_at: row.created_at
  };
}

function deleteState(state: string): void {
  const stmt = db.prepare('DELETE FROM oauth_state WHERE state = ?');
  stmt.run(state);
}
