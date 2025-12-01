import { NextRequest, NextResponse } from 'next/server';
import { loadChartOfAccounts } from '@/lib/qbo/chartOfAccounts';

export async function GET(req: NextRequest) {
  try {
    const accountsSet = loadChartOfAccounts();
    const accounts = Array.from(accountsSet);

    return NextResponse.json({
      success: true,
      accounts: accounts.sort(),
    });
  } catch (error: any) {
    console.error('[API][QBO][CHART_OF_ACCOUNTS] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_load', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

