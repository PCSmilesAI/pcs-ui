import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '../../../../lib/qbo/qboClient';
import { getLatestTokens } from '../../../../lib/qbo/memoryStorage';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 Fetching QuickBooks categories...');

    // Check if QuickBooks is connected
    const tokens = await getLatestTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: 'QuickBooks not connected. Please connect to QuickBooks first.'
      }, { status: 400 });
    }

    // Initialize QBO client
    await qboClient.initialize();

    // Test connection first
    const isConnected = await qboClient.testConnection();
    if (!isConnected) {
      throw new Error('QuickBooks connection failed. Please reconnect.');
    }

    // Get all items (categories) from QuickBooks
    const allItems = await qboClient.getItems();
    const dentalItems = await qboClient.getDentalItems();

    console.log('📋 Found', allItems.length, 'total items and', dentalItems.length, 'dental items');

    return NextResponse.json({
      success: true,
      categories: {
        all: allItems.map(item => ({
          id: item.Id,
          name: item.Name,
          type: item.Type,
          accountRef: item.ExpenseAccountRef || item.IncomeAccountRef
        })),
        dental: dentalItems.map(item => ({
          id: item.Id,
          name: item.Name,
          type: item.Type,
          accountRef: item.ExpenseAccountRef || item.IncomeAccountRef
        }))
      },
      message: `Found ${allItems.length} total categories and ${dentalItems.length} dental-specific categories`
    });

  } catch (error: any) {
    console.error('❌ Error fetching QBO categories:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch categories from QuickBooks'
    }, { status: 500 });
  }
}
