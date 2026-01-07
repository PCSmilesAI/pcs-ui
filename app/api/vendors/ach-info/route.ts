import { NextResponse } from 'next/server';
import { qboClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';
import { loadMap, findVendorKey } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Get vendor payment status from QuickBooks
 * 
 * This endpoint checks if a vendor exists in QBO and returns their payment readiness status.
 * Note: QBO does not expose vendor bank account details via API for security reasons.
 * The ACH status is determined by checking if the vendor is in the QuickBooks Business Network.
 * 
 * Status values:
 * - 'missing': Vendor not found in QBO
 * - 'pending': Vendor exists in QBO but not yet set up for payments
 * - 'complete': Vendor is ready to receive payments via QBO Bill Pay
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const vendorParam = (url.searchParams.get('vendor') || '').trim();

    // SECURITY: Validate input parameters
    if (vendorParam && (vendorParam.length > 255 || !/^[a-zA-Z0-9\s\-&.,()]+$/.test(vendorParam))) {
      console.warn('[VENDOR_ACH_INFO] Invalid vendor parameter', { vendor: vendorParam });
      return json(400, { ok: false, error: 'Invalid vendor name' });
    }

    if (!vendorParam) {
      return json(400, { ok: false, error: 'vendor parameter required' });
    }

    // Check QBO connection
    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens) {
      console.warn('[VENDOR_ACH_INFO] QBO not connected');
      return json(200, {
        ok: true,
        vendor: vendorParam,
        ach_status: 'missing',
        qbo_connected: false,
        message: 'QuickBooks not connected',
      });
    }

    // Check local vendor map for any cached status
    const map = await loadMap();
    const vendorKey = findVendorKey(map, vendorParam);
    const localVendorData = vendorKey ? map.vendors[vendorKey] : null;

    // Try to find vendor in QBO
    let qboVendor: { Id?: string; DisplayName?: string } | null = null;
    let achStatus = 'missing';

    try {
      await qboClient.initialize();
      const foundVendor = await qboClient.findVendorByName(vendorParam);
      qboVendor = foundVendor as { Id?: string; DisplayName?: string } | null;
      
      if (qboVendor) {
        // Vendor exists in QBO - they can receive payments via QBO Bill Pay
        // QBO handles vendor bank info internally through the Business Network
        achStatus = 'complete';
        
        console.log('[VENDOR_ACH_INFO] Vendor found in QBO', {
          vendor: vendorParam,
          qboVendorId: qboVendor.Id,
          qboVendorName: qboVendor.DisplayName,
        });
      } else {
        // Vendor not found in QBO
        achStatus = 'missing';
        console.log('[VENDOR_ACH_INFO] Vendor not found in QBO', { vendor: vendorParam });
      }
    } catch (qboError: any) {
      // QBO query failed - use local cached status if available
      console.warn('[VENDOR_ACH_INFO] QBO query failed', { error: qboError?.message });
      achStatus = localVendorData?.ach_status || 'missing';
    }

    return json(200, {
      ok: true,
      vendor: vendorParam,
      ach_status: achStatus,
      qbo_connected: true,
      qbo_vendor_id: qboVendor?.Id || null,
      qbo_vendor_name: qboVendor?.DisplayName || null,
      // Note: QBO does not expose bank account details via API
      bank: null,
      message: qboVendor 
        ? 'Vendor found in QuickBooks - ready for Bill Pay' 
        : 'Vendor not found in QuickBooks - will be created on first bill',
    });
  } catch (err: any) {
    console.error('[VENDOR_ACH_INFO] Error:', err?.message || err);
    return json(500, { ok: false, error: 'Failed to retrieve vendor information' });
  }
}
