/**
 * SQLite-Backed Session Store
 * 
 * Provides persistent session storage for user authentication
 * Sessions are stored in SQLite database with automatic expiration
 */

import { getDatabase } from '../db/client';
import { randomBytes } from 'crypto';

export interface Session {
  id: string;
  email: string;
  name: string;
  role?: string;
  data?: Record<string, any>;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/**
 * Initialize sessions table
 */
export function initSessionStore(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT,
      data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
  `);

  console.log('[SESSION] Session store initialized');
}

/**
 * Generate a new session ID
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new session
 */
export function createSession(
  email: string,
  name: string,
  role?: string,
  data?: Record<string, any>,
  expiresInSeconds: number = 30 * 24 * 60 * 60 // 30 days
): Session {
  const db = getDatabase();
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

  db.prepare(`
    INSERT INTO sessions (id, email, name, role, data, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    email,
    name,
    role || null,
    data ? JSON.stringify(data) : null,
    expiresAt.toISOString()
  );

  console.log('[SESSION] Created session:', { sessionId, email });

  return {
    id: sessionId,
    email,
    name,
    role,
    data,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): Session | null {
  const db = getDatabase();
  
  const session = db.prepare(`
    SELECT * FROM sessions 
    WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
  `).get(sessionId) as any;

  if (!session) return null;

  return {
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
    data: session.data ? JSON.parse(session.data) : undefined,
    created_at: session.created_at,
    updated_at: session.updated_at,
    expires_at: session.expires_at,
  };
}

/**
 * Update a session
 */
export function updateSession(
  sessionId: string,
  updates: Partial<Session>
): Session | null {
  const db = getDatabase();
  
  const session = getSession(sessionId);
  if (!session) return null;

  const data = updates.data ? JSON.stringify(updates.data) : session.data;
  
  db.prepare(`
    UPDATE sessions SET
      email = ?,
      name = ?,
      role = ?,
      data = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    updates.email || session.email,
    updates.name || session.name,
    updates.role || session.role,
    data,
    sessionId
  );

  console.log('[SESSION] Updated session:', sessionId);

  return getSession(sessionId);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  const db = getDatabase();
  
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  
  console.log('[SESSION] Deleted session:', sessionId);
}

/**
 * Get all sessions for a user
 */
export function getUserSessions(email: string): Session[] {
  const db = getDatabase();
  
  const sessions = db.prepare(`
    SELECT * FROM sessions 
    WHERE email = ? AND expires_at > CURRENT_TIMESTAMP
    ORDER BY updated_at DESC
  `).all(email) as any[];

  return sessions.map(s => ({
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    data: s.data ? JSON.parse(s.data) : undefined,
    created_at: s.created_at,
    updated_at: s.updated_at,
    expires_at: s.expires_at,
  }));
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP
  `).run() as any;

  const deleted = result.changes || 0;
  console.log(`[SESSION] Cleaned up ${deleted} expired sessions`);

  return deleted;
}

/**
 * Get session count
 */
export function getSessionCount(): number {
  const db = getDatabase();
  
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM sessions 
    WHERE expires_at > CURRENT_TIMESTAMP
  `).get() as any;

  return result?.count || 0;
}

