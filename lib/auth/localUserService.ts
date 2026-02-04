import { getDatabase } from '../db/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get a user by email from the local database
 */
export function getUserByEmail(email: string): LocalUser | null {
  const db = getDatabase();
  const normalizedEmail = email.toLowerCase().trim();
  
  const user = db.prepare(`
    SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1
  `).get(normalizedEmail) as LocalUser | undefined;
  
  return user || null;
}

/**
 * Get all active users from the local database
 */
export function getAllUsers(): LocalUser[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM users WHERE is_active = 1 ORDER BY created_at ASC
  `).all() as LocalUser[];
}

/**
 * Create a new user in the local database
 */
export async function createUser(
  email: string, 
  name: string, 
  password: string,
  role: string = 'user'
): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  const db = getDatabase();
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if user already exists
  const existing = getUserByEmail(normalizedEmail);
  if (existing) {
    return { success: false, error: 'Email already registered' };
  }
  
  try {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, normalizedEmail, name, passwordHash, role, now, now);
    
    const user = getUserByEmail(normalizedEmail);
    console.log(`✅ [AUTH] Created user: ${normalizedEmail} (${name})`);
    
    return { success: true, user: user || undefined };
  } catch (error: any) {
    console.error('❌ [AUTH] Failed to create user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify a user's password
 */
export async function verifyPassword(email: string, password: string): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = getUserByEmail(normalizedEmail);
  
  if (!user) {
    console.log(`❌ [AUTH] User not found: ${normalizedEmail}`);
    return { success: false, error: 'Invalid credentials' };
  }
  
  try {
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (isValid) {
      // Update last login time
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, user.id);
      
      console.log(`✅ [AUTH] Login successful: ${normalizedEmail}`);
      return { success: true, user };
    } else {
      console.log(`❌ [AUTH] Invalid password for: ${normalizedEmail}`);
      return { success: false, error: 'Invalid credentials' };
    }
  } catch (error: any) {
    console.error('❌ [AUTH] Password verification failed:', error);
    return { success: false, error: 'Authentication error' };
  }
}

/**
 * Update a user's password
 */
export async function updatePassword(email: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = getUserByEmail(normalizedEmail);
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  try {
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, now, user.id);
    
    console.log(`✅ [AUTH] Password updated for: ${normalizedEmail}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ [AUTH] Failed to update password:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update a user's role
 */
export function updateUserRole(email: string, newRole: string): { success: boolean; error?: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const user = getUserByEmail(normalizedEmail);
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`).run(newRole, now, user.id);
    
    console.log(`✅ [AUTH] Role updated for ${normalizedEmail}: ${user.role} -> ${newRole}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ [AUTH] Failed to update role:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure a user exists (create if not exists, useful for seeding)
 */
export async function ensureUserExists(
  email: string,
  name: string,
  password: string,
  role: string = 'user'
): Promise<LocalUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  let user = getUserByEmail(normalizedEmail);
  
  if (!user) {
    const result = await createUser(normalizedEmail, name, password, role);
    if (result.success && result.user) {
      user = result.user;
    }
  }
  
  return user;
}

/**
 * Seed essential users (called on server startup)
 * Passwords are read from environment variables for security
 */
export async function seedEssentialUsers(): Promise<void> {
  console.log('[AUTH] Seeding essential users...');
  
  // Get seed password from environment variable (set on server only)
  const seedPassword = process.env.ADMIN_SEED_PASSWORD;
  
  if (!seedPassword) {
    console.log('[AUTH] ADMIN_SEED_PASSWORD not set - skipping user seeding');
    console.log('[AUTH] To seed admin users, set ADMIN_SEED_PASSWORD in server .env');
    return;
  }
  
  // Essential users that should always exist
  const essentialUsers = [
    { email: 'mckaym@pcsmiles.com', name: 'McKay', role: 'admin' },
    { email: 'business@pcsmilesai.com', name: 'Braxton', role: 'admin' },
    { email: 'laurag@pcsmiles.com', name: 'Laura', role: 'admin' },
  ];
  
  for (const user of essentialUsers) {
    const existing = getUserByEmail(user.email);
    if (!existing) {
      await createUser(user.email, user.name, seedPassword, user.role);
      console.log(`✅ [AUTH] Seeded user: ${user.email}`);
    } else {
      // Update role if it doesn't match expected role
      if (existing.role !== user.role) {
        updateUserRole(user.email, user.role);
        console.log(`✅ [AUTH] Updated role for ${user.email}: ${existing.role} -> ${user.role}`);
      } else {
        console.log(`ℹ️ [AUTH] User already exists with correct role: ${user.email}`);
      }
    }
  }
  
  console.log('[AUTH] Essential users seeding complete');
}

