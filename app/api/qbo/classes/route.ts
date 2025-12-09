import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';

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

    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens?.realmId) {
      return NextResponse.json(
        { error: 'not_connected', detail: 'No realmId/tokens found.' },
        { status: 401 }
      );
    }

    const qboClient = new QBOClient();
    await qboClient.initialize();

    let classes = await qboClient.getClasses();

    // Apply search filter if provided
    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      classes = classes.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.fullName.toLowerCase().includes(searchLower)
      );
    }

    const result = classes.map(c => ({
      id: c.id,
      name: c.name,
      fullName: c.fullName,
    }));

    // Update cache if no search filter
    if (!searchParam) {
      classesCache = {
        data: result,
        timestamp: Date.now(),
      };
    }

    return NextResponse.json({
      success: true,
      classes: result,
    });
  } catch (error: any) {
    console.error('[API][QBO][CLASSES] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_fetch', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

