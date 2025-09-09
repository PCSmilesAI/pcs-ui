import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 Fetching QuickBooks categories...');

    // Get the latest tokens from SQLite storage
    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens) {
      console.log('❌ No tokens found in SQLite storage');
      return NextResponse.json({
        success: false,
        error: 'QuickBooks not connected. Please connect to QuickBooks first.'
      }, { status: 400 });
    }

    console.log('✅ Found tokens, realmId:', tokens.realmId);

    // Make direct API call to QuickBooks
    const url = `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}/items?minorversion=65`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('❌ QuickBooks API error:', response.status, await response.text());
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch items from QuickBooks'
      }, { status: 500 });
    }

    const data = await response.json();
    const items = data.QueryResponse?.Item || [];

    console.log('📋 Found', items.length, 'items from QuickBooks');

    return NextResponse.json({
      success: true,
      categories: {
        all: items.map(item => ({
          id: item.Id,
          name: item.Name,
          type: item.Type,
          accountRef: item.ExpenseAccountRef || item.IncomeAccountRef
        })),
        dental: items.filter(item => 
          item.Type === 'Service' && 
          (item.Name.toLowerCase().includes('dental') || 
           item.Name.toLowerCase().includes('supply') ||
           item.Name.toLowerCase().includes('equipment'))
        ).map(item => ({
          id: item.Id,
          name: item.Name,
          type: item.Type,
          accountRef: item.ExpenseAccountRef || item.IncomeAccountRef
        }))
      },
      message: `Found ${items.length} total categories`
    });

  } catch (error: any) {
    console.error('❌ Error fetching QBO categories:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch categories from QuickBooks'
    }, { status: 500 });
  }
}