// In-memory storage for Vercel serverless environment
// This is a temporary solution until we implement a proper cloud database

interface QBOTokens {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtained_at?: number;
}

// In-memory storage (resets on each serverless function invocation)
let tokenStorage: Map<string, QBOTokens> = new Map();

export async function saveTokens(realmId: string, tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number;
}): Promise<void> {
  console.log('💾 Saving tokens to memory storage for realmId:', realmId);
  
  tokenStorage.set(realmId, {
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    obtained_at: tokens.obtained_at
  });
  
  console.log('✅ Tokens saved to memory storage');
}

export async function getTokens(realmId: string): Promise<QBOTokens | null> {
  console.log('🔍 Getting tokens for realmId:', realmId);
  return tokenStorage.get(realmId) || null;
}

export async function getAllTokens(): Promise<QBOTokens[]> {
  console.log('🔍 Getting all tokens from memory storage');
  return Array.from(tokenStorage.values());
}

export async function getLatestTokens(): Promise<QBOTokens | null> {
  console.log('🔍 Getting latest tokens from memory storage');
  const tokens = Array.from(tokenStorage.values());
  return tokens.length > 0 ? tokens[tokens.length - 1] : null;
}

export async function deleteTokens(realmId: string): Promise<void> {
  console.log('🗑️ Deleting tokens for realmId:', realmId);
  tokenStorage.delete(realmId);
  console.log('✅ Tokens deleted from memory storage');
}

// Helper function to check if tokens are expired
export function isTokenExpired(tokens: QBOTokens): boolean {
  const { expiresIn } = tokens;
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
