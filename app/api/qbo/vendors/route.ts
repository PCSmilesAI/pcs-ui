import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';

export const dynamic = 'force-dynamic';

// Cache for vendors (5 minute TTL)
let vendorsCache: { data: Array<{ id: string; name: string; displayName: string }>; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  try {
    const searchParam = req.nextUrl.searchParams.get('search') || '';
    const useCache = !searchParam
      && vendorsCache
      && vendorsCache.data.length > 0
      && (Date.now() - vendorsCache.timestamp < CACHE_TTL);
    
    if (useCache && vendorsCache) {
      return NextResponse.json({
        success: true,
        vendors: vendorsCache.data,
      });
    }

    let vendors: Array<{ id: string; name: string; displayName: string }> = [];

    // Try to get vendors from QBO API
    try {
      const tokens = await tokenStorage.getLatestTokens();
      if (tokens?.realmId) {
        const qboClient = new QBOClient();
        await qboClient.initialize();
        const qboVendors = await qboClient.getAllVendors();
        
        if (qboVendors.length > 0) {
          vendors = qboVendors.map(v => ({
            id: v.id,
            name: v.name,
            displayName: v.displayName,
          }));
        }
      }
    } catch (qboError: any) {
      console.warn('[API][QBO][VENDORS] QBO API failed:', qboError.message);
    }

    // Sort vendors alphabetically by display name
    vendors.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Apply search filter if provided
    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      vendors = vendors.filter(v => 
        v.name.toLowerCase().includes(searchLower) ||
        v.displayName.toLowerCase().includes(searchLower)
      );
    }

    // Only cache successful non-empty fetches — never cache an empty list from a QBO failure
    if (!searchParam && vendors.length > 0) {
      vendorsCache = {
        data: vendors,
        timestamp: Date.now(),
      };
    }

    return NextResponse.json({
      success: true,
      vendors: vendors,
    });
  } catch (error: any) {
    console.error('[API][QBO][VENDORS] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_fetch', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}




