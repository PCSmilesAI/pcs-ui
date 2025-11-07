import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '../../../../lib/db/client';
import { migrateFromJSON, isMigrationNeeded } from '../../../../lib/db/migrate-from-json';
import { initSessionStore } from '../../../../lib/session/sessionStore';
import { initRateLimiter } from '../../../../lib/ratelimit/rateLimiter';

export const dynamic = 'force-dynamic';

let initPromise: Promise<any> | null = null;

/**
 * Initialize the database on first request.
 * This endpoint is called automatically by the app on startup.
 */
export async function GET(req: NextRequest) {
  try {
    // Prevent concurrent initialization
    if (!initPromise) {
      initPromise = (async () => {
        console.log('[DB][INIT]', 'Starting database initialization');

        // Run schema migrations
        runMigrations();
        console.log('[DB][INIT]', 'Schema migrations completed');

        // Initialize session store
        try {
          initSessionStore();
          console.log('[DB][INIT]', 'Session store initialized');
        } catch (err: any) {
          console.warn('[DB][INIT]', 'Session store initialization warning:', err?.message);
        }

        // Initialize rate limiter
        try {
          initRateLimiter();
          console.log('[DB][INIT]', 'Rate limiter initialized');
        } catch (err: any) {
          console.warn('[DB][INIT]', 'Rate limiter initialization warning:', err?.message);
        }

        // Check if data migration is needed
        if (isMigrationNeeded()) {
          console.log('[DB][INIT]', 'Data migration needed, starting...');
          const result = await migrateFromJSON();
          console.log('[DB][INIT]', 'Data migration completed', result);
          return result;
        } else {
          console.log('[DB][INIT]', 'Data migration not needed');
          return { migrated: 0, skipped: 0, alreadyMigrated: true };
        }
      })();
    }

    const result = await initPromise;

    return NextResponse.json({
      ok: true,
      message: 'Database initialized successfully',
      ...result,
    });
  } catch (err: any) {
    console.error('[DB][INIT]', 'Initialization failed', { error: err?.message });
    return NextResponse.json(
      { error: err?.message || 'Initialization failed' },
      { status: 500 }
    );
  }
}

