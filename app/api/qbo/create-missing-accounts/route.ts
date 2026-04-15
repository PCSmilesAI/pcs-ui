import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '@/lib/qbo/qboClient';
import { clearLookupCaches } from '@/lib/qbo/qboLookup';

interface AccountToCreate {
  name: string;
  acctNum: string;
  type: string;
  subType: string;
  parentAcctNum?: string;
}

const ACCOUNTS_HIERARCHY: AccountToCreate[] = [
  { name: 'Direct Supplies', acctNum: '52000', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '50000' },
  { name: 'Sundries', acctNum: '52100', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52000' },
  { name: 'Dental Supplies', acctNum: '52110', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52100' },
  { name: 'Medical Gases', acctNum: '52120', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52100' },
  { name: 'Drugs', acctNum: '52130', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52100' },
  { name: 'Lab Fees', acctNum: '52200', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52000' },
  { name: 'Dental Lab Fees', acctNum: '52210', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52200' },
  { name: 'Aligner Lab Fees', acctNum: '52220', type: 'Expense', subType: 'SuppliesMaterials', parentAcctNum: '52200' },
  { name: 'Dental Equipment', acctNum: '53210', type: 'Expense', subType: 'OtherBusinessExpenses', parentAcctNum: '53200' },
];

/**
 * GET  = dry-run preview of accounts to create
 * POST = actually create the accounts in QBO
 */
export async function GET() {
  return handleCreateAccounts(true);
}

export async function POST() {
  return handleCreateAccounts(false);
}

async function handleCreateAccounts(dryRun: boolean) {
  try {
    await qboClient.initialize();

    const allAccounts = await qboClient.getAllAccounts();
    const acctNumToId = new Map<string, string>();
    const existingNums = new Set<string>();

    for (const account of allAccounts) {
      if (account.acctNum) {
        acctNumToId.set(account.acctNum, account.id);
        existingNums.add(account.acctNum);
      }
    }

    const results: Array<{
      name: string;
      acctNum: string;
      parentAcctNum?: string;
      status: 'created' | 'already-exists' | 'error' | 'would-create';
      qboId?: string;
      error?: string;
    }> = [];

    for (const acct of ACCOUNTS_HIERARCHY) {
      if (existingNums.has(acct.acctNum)) {
        results.push({
          name: acct.name,
          acctNum: acct.acctNum,
          parentAcctNum: acct.parentAcctNum,
          status: 'already-exists',
          qboId: acctNumToId.get(acct.acctNum),
        });
        continue;
      }

      if (dryRun) {
        results.push({
          name: acct.name,
          acctNum: acct.acctNum,
          parentAcctNum: acct.parentAcctNum,
          status: 'would-create',
        });
        continue;
      }

      try {
        const parentId = acct.parentAcctNum ? acctNumToId.get(acct.parentAcctNum) : undefined;
        if (acct.parentAcctNum && !parentId) {
          results.push({
            name: acct.name,
            acctNum: acct.acctNum,
            parentAcctNum: acct.parentAcctNum,
            status: 'error',
            error: `Parent account ${acct.parentAcctNum} not found (create it first)`,
          });
          continue;
        }

        const payload: any = {
          Name: acct.name,
          AcctNum: acct.acctNum,
          AccountType: acct.type,
          AccountSubType: acct.subType,
        };

        if (parentId) {
          payload.SubAccount = true;
          payload.ParentRef = { value: parentId };
        }

        const created = await qboClient.createAccount(payload);
        const newId = created?.Id || created?.id;

        if (newId) {
          acctNumToId.set(acct.acctNum, newId);
          existingNums.add(acct.acctNum);
        }

        results.push({
          name: acct.name,
          acctNum: acct.acctNum,
          parentAcctNum: acct.parentAcctNum,
          status: 'created',
          qboId: newId,
        });

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error: any) {
        results.push({
          name: acct.name,
          acctNum: acct.acctNum,
          parentAcctNum: acct.parentAcctNum,
          status: 'error',
          error: error?.message || 'Unknown error',
        });
      }
    }

    if (!dryRun) {
      clearLookupCaches();
    }

    return NextResponse.json({
      dryRun,
      summary: {
        total: ACCOUNTS_HIERARCHY.length,
        created: results.filter(r => r.status === 'created' || r.status === 'would-create').length,
        alreadyExists: results.filter(r => r.status === 'already-exists').length,
        errors: results.filter(r => r.status === 'error').length,
      },
      results,
    });
  } catch (error: any) {
    console.error('[CREATE_ACCOUNTS] Fatal error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create accounts' },
      { status: 500 }
    );
  }
}
