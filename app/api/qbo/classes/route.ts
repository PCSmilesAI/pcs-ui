import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';
import { PCS_CLASSES } from '@/lib/qbo/pcsClasses';

// Cache for classes (5 minute TTL)
let classesCache: { data: Array<{ id: string; name: string; fullName: string }>; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

    let classes: Array<{ id: string; name: string; fullName: string }> = [];

    // Try to get classes from QBO API first
    try {
      const tokens = await tokenStorage.getLatestTokens();
      if (tokens?.realmId) {
        const qboClient = new QBOClient();
        await qboClient.initialize();
        const qboClasses = await qboClient.getClasses();
        
        if (qboClasses.length > 0) {
          classes = qboClasses.map(c => ({
            id: c.id,
            name: c.name,
            fullName: c.fullName,
          }));
        }
      }
    } catch (qboError: any) {
      console.warn('[API][QBO][CLASSES] QBO API failed, using hardcoded classes:', qboError.message);
    }

    // Fallback to hardcoded PCS classes if QBO returned empty or failed
    if (classes.length === 0) {
      console.log('[API][QBO][CLASSES] Using hardcoded PCS classes');
      classes = [...PCS_CLASSES];
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

