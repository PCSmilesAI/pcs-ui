import { NextRequest, NextResponse } from 'next/server';
import { normalizeExistingVendorNames } from '../../../../lib/db/normalize-vendor-names';

export const dynamic = 'force-dynamic';

/**
 * Normalize existing vendor names in the database
 * This consolidates vendor names like "exodus_dental_solutions" and "Exodus Dental Solutions"
 * into a single canonical format
 * 
 * This is an admin-only operation
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[API][NORMALIZE-VENDORS]', 'Starting vendor name normalization');

    const result = normalizeExistingVendorNames();

    return NextResponse.json({
      ok: true,
      message: 'Vendor names normalized successfully',
      updated: result.updated,
      errors: result.errors
    });
  } catch (error) {
    console.error('[API][NORMALIZE-VENDORS]', 'Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to normalize vendor names' },
      { status: 500 }
    );
  }
}

