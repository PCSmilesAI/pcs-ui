/**
 * Vendor History API - Vendor-specific Operations
 * 
 * GET /api/vendor-history/[vendor] - Get history entries for a specific vendor
 * DELETE /api/vendor-history/[vendor]?entryId=xxx - Delete a specific history entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';
import { getVendorHistory, deleteHistoryEntry, getRecentHistory } from '@/lib/gpt/vendorHistory';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ vendor: string }>;
}

/**
 * GET - Get history entries for a vendor
 * 
 * Query params:
 * - limit: number (optional, default 20)
 * - includeImages: boolean (optional, default false - images are large)
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = getCurrentUser(req);
    const { vendor: vendorNameEncoded } = await context.params;
    const vendorName = decodeURIComponent(vendorNameEncoded);
    
    // Check admin/AP access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const includeImages = url.searchParams.get('includeImages') === 'true';

    const history = getVendorHistory(vendorName);
    
    if (!history) {
      return NextResponse.json({
        success: true,
        vendor_name: vendorName,
        entry_count: 0,
        entries: [],
      });
    }

    // Sort by added_at descending and limit
    const sorted = [...history.entries]
      .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
      .slice(0, limit);

    // Optionally strip images to reduce response size
    const entries = sorted.map(entry => ({
      id: entry.id,
      invoice_number: entry.invoice_number,
      added_at: entry.added_at,
      was_corrected: entry.was_corrected,
      parsed_data: entry.parsed_data,
      image_count: entry.images.length,
      // Only include images if requested
      ...(includeImages ? { images: entry.images } : {}),
    }));

    return NextResponse.json({
      success: true,
      vendor_name: history.vendor_name,
      last_updated: history.last_updated,
      entry_count: history.entries.length,
      entries,
    });
  } catch (error: any) {
    console.error('[API][VENDOR-HISTORY]', 'get_vendor_error', { error: error.message });
    return NextResponse.json({ error: 'Failed to get vendor history' }, { status: 500 });
  }
}

/**
 * DELETE - Delete a history entry
 * 
 * Query params:
 * - entryId: string (required)
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = getCurrentUser(req);
    const { vendor: vendorNameEncoded } = await context.params;
    const vendorName = decodeURIComponent(vendorNameEncoded);
    
    // Only admins can delete history entries
    const hasAccess = await isAdmin(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const entryId = url.searchParams.get('entryId');

    if (!entryId) {
      return NextResponse.json(
        { error: 'entryId query parameter is required' },
        { status: 400 }
      );
    }

    const deleted = deleteHistoryEntry(vendorName, entryId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Entry not found or could not be deleted' },
        { status: 404 }
      );
    }

    console.log('[API][VENDOR-HISTORY]', 'deleted_entry', {
      vendorName,
      entryId,
      userEmail: user.email,
    });

    return NextResponse.json({
      success: true,
      message: 'Entry deleted',
      vendor_name: vendorName,
      entry_id: entryId,
    });
  } catch (error: any) {
    console.error('[API][VENDOR-HISTORY]', 'delete_error', { error: error.message });
    return NextResponse.json({ error: 'Failed to delete history entry' }, { status: 500 });
  }
}
