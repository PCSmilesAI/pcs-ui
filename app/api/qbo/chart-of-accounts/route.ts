import { NextRequest, NextResponse } from 'next/server';
import { loadChartOfAccounts } from '@/lib/qbo/chartOfAccounts';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';

export const dynamic = 'force-dynamic';

interface AccountDisplay {
  id: string;
  name: string;
  number?: string;
  fullPath: string;
  parentName?: string;
  displayText: string;
  type: string;
  subType?: string;
}

// Cache for accounts (5 minute TTL)
let accountsCache: { data: AccountDisplay[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function parseAccountPath(fullPath: string): { name: string; number?: string; parentName?: string } {
  // Format: "50000 Expenses: 52000 Direct Supplies: 52100 Sundries: 52110 Dental Supplies"
  // Extract account number (first part before space)
  const parts = fullPath.split(':');
  const firstPart = parts[0]?.trim() || '';
  const numberMatch = firstPart.match(/^(\d+)\s+(.+)$/);
  
  let number: string | undefined;
  let name = fullPath;
  let parentName: string | undefined;
  
  if (numberMatch) {
    number = numberMatch[1];
    name = numberMatch[2] + (parts.length > 1 ? ':' + parts.slice(1).join(':') : '');
  }
  
  // Extract parent name (second to last part)
  if (parts.length > 1) {
    const parentPart = parts[parts.length - 2]?.trim() || '';
    const parentMatch = parentPart.match(/^\d+\s+(.+)$/);
    if (parentMatch) {
      parentName = parentMatch[1];
    }
  }
  
  return { name, number, parentName };
}

function formatDisplayText(account: AccountDisplay): string {
  // Format: "52220 - Account Name" or "Account Name" if no number
  // Example: "52220 - Aligner Lab Fees" or "52220 - Aligner Lab Fees (Sub-account of Lab Fees)"
  let text = '';
  
  if (account.number) {
    text = `${account.number} - ${account.name}`;
  } else {
    text = account.name;
  }
  
  if (account.parentName) {
    text += ` (Sub-account of ${account.parentName})`;
  }
  
  return text;
}

export async function GET(req: NextRequest) {
  try {
    const searchParam = req.nextUrl.searchParams.get('search') || '';
    const useCache = !searchParam && accountsCache && (Date.now() - accountsCache.timestamp < CACHE_TTL);
    
    if (useCache && accountsCache) {
      return NextResponse.json({
        success: true,
        accounts: accountsCache.data,
      });
    }

    // Try to get accounts from QBO API first
    let accounts: AccountDisplay[] = [];
    try {
      const tokens = await tokenStorage.getLatestTokens();
      if (tokens?.realmId) {
        const qboClient = new QBOClient();
        await qboClient.initialize();
        
        // Use getAllAccounts method which returns accounts with fullName
        const qboAccounts = await qboClient.getAllAccounts();
        
        accounts = qboAccounts.map((acc: any) => {
          const fullPath = acc.fullName || acc.name;
          const parsed = parseAccountPath(fullPath);
          
          // Use AcctNum from QBO if available, otherwise try to parse from path
          const accountNumber = acc.acctNum || parsed.number;
          
          const account: AccountDisplay = {
            id: acc.id,
            name: acc.name,
            number: accountNumber,
            fullPath: fullPath,
            parentName: parsed.parentName,
            displayText: '', // Will be set below
            type: acc.type || '',
            subType: acc.subType,
          };
          
          account.displayText = formatDisplayText(account);
          return account;
        });
      }
    } catch (qboError: any) {
      console.warn('[API][QBO][CHART_OF_ACCOUNTS] QBO API failed, falling back to JSON file:', qboError.message);
    }

    // Fallback to JSON file if QBO unavailable or empty
    if (accounts.length === 0) {
      const accountsSet = loadChartOfAccounts();
      const accountPaths = Array.from(accountsSet).sort();
      
      accounts = accountPaths.map((path, index) => {
        const parsed = parseAccountPath(path);
        const parts = path.split(':');
        const accountName = parts[parts.length - 1]?.trim() || path;
        
        const account: AccountDisplay = {
          id: `fallback-${index}`,
          name: accountName,
          number: parsed.number,
          fullPath: path,
          parentName: parsed.parentName,
          displayText: '',
          type: 'Expense',
        };
        
        account.displayText = formatDisplayText(account);
        return account;
      });
    }

    // Apply search filter if provided
    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      accounts = accounts.filter(acc => 
        acc.name.toLowerCase().includes(searchLower) ||
        acc.number?.includes(searchParam) ||
        acc.fullPath.toLowerCase().includes(searchLower)
      );
    }

    // Update cache if no search filter
    if (!searchParam) {
      accountsCache = {
        data: accounts,
        timestamp: Date.now(),
      };
    }

    return NextResponse.json({
      success: true,
      accounts: accounts,
    });
  } catch (error: any) {
    console.error('[API][QBO][CHART_OF_ACCOUNTS] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_load', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

