import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';
import { PCS_CLASSES } from '@/lib/qbo/pcsClasses';

export const dynamic = 'force-dynamic';

// Cache for classes (5 minute TTL)
let classesCache: { data: Array<{ id: string; name: string; fullName: string }>; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track last sync check time (only check once per hour)
let lastSyncCheck: number = 0;
const SYNC_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  try {
    const searchParam = req.nextUrl.searchParams.get('search') || '';
    const useCache = !searchParam && classesCache && (Date.now() - classesCache.timestamp < CACHE_TTL);
    
    if (useCache && classesCache) {
      return NextResponse.json({
        success: true,
        classes: classesCache.data,
      });
    }

    // Use hardcoded classes as the primary source
    let classes: Array<{ id: string; name: string; fullName: string }> = [...PCS_CLASSES];

    // Periodically check QBO API to ensure hardcoded classes are up to date
    const shouldSyncCheck = Date.now() - lastSyncCheck > SYNC_CHECK_INTERVAL;
    if (shouldSyncCheck) {
      try {
        const tokens = await tokenStorage.getLatestTokens();
        if (tokens?.realmId) {
          const qboClient = new QBOClient();
          await qboClient.initialize();
          const qboClasses = await qboClient.getClasses();
          
          if (qboClasses.length > 0) {
            // Check for differences between hardcoded and live QBO data
            const hardcodedNames = new Set(PCS_CLASSES.map(c => c.name));
            const qboNames = new Set(qboClasses.map(c => c.name));
            
            const missingInHardcoded = qboClasses.filter(c => !hardcodedNames.has(c.name));
            const missingInQBO = PCS_CLASSES.filter(c => !qboNames.has(c.name));
            
            if (missingInHardcoded.length > 0) {
              console.warn('[API][QBO][CLASSES] ⚠️ Classes in QBO but NOT in hardcoded list:', 
                missingInHardcoded.map(c => `${c.name} (ID: ${c.id})`).join(', '));
            }
            if (missingInQBO.length > 0) {
              console.warn('[API][QBO][CLASSES] ⚠️ Classes in hardcoded but NOT in QBO:', 
                missingInQBO.map(c => c.name).join(', '));
            }
            
            // Check for ID mismatches
            for (const qboClass of qboClasses) {
              const hardcoded = PCS_CLASSES.find(c => c.name === qboClass.name);
              if (hardcoded && hardcoded.id !== qboClass.id) {
                console.warn(`[API][QBO][CLASSES] ⚠️ ID mismatch for ${qboClass.name}: hardcoded=${hardcoded.id}, QBO=${qboClass.id}`);
              }
            }
            
            console.log(`[API][QBO][CLASSES] Sync check complete - Hardcoded: ${PCS_CLASSES.length}, QBO: ${qboClasses.length}`);
          }
          
          lastSyncCheck = Date.now();
        }
      } catch (qboError: any) {
        console.warn('[API][QBO][CLASSES] Sync check failed (using hardcoded):', qboError.message);
        lastSyncCheck = Date.now(); // Don't retry immediately on failure
      }
    }

    // Apply search filter if provided
    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      classes = classes.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.fullName.toLowerCase().includes(searchLower)
      );
    }

    // Update cache if no search filter
    if (!searchParam) {
      classesCache = {
        data: classes,
        timestamp: Date.now(),
      };
    }

    return NextResponse.json({
      success: true,
      classes: classes,
    });
  } catch (error: any) {
    console.error('[API][QBO][CLASSES] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_fetch', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
