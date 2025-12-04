import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const searchQuery = req.nextUrl.searchParams.get('q') || '';
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

    if (!searchQuery || searchQuery.length < 2) {
      return NextResponse.json({
        success: true,
        vendors: [],
      });
    }

    const db = getDatabase();
    const vendors: Array<{ id: string; name: string }> = [];

    // Search vendors from invoices table
    const searchLower = `%${searchQuery.toLowerCase()}%`;
    const invoiceVendors = db
      .prepare(
        `SELECT DISTINCT vendor_name 
         FROM invoices 
         WHERE vendor_name IS NOT NULL 
           AND vendor_name != '' 
           AND vendor_name LIKE ? 
           AND deleted = 0
         ORDER BY vendor_name
         LIMIT ?`
      )
      .all(searchLower, limit) as Array<{ vendor_name: string }>;

    invoiceVendors.forEach((row, index) => {
      vendors.push({
        id: `vendor-${index}`,
        name: row.vendor_name,
      });
    });

    return NextResponse.json({
      success: true,
      vendors: vendors,
    });
  } catch (error: any) {
    console.error('[API][VENDORS][SEARCH] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_search', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

