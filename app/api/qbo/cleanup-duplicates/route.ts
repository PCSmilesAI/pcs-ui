import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '@/lib/qbo/qboClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BillSummary {
  Id: string;
  DocNumber: string;
  VendorName: string;
  VendorRef: string;
  TotalAmt: number;
  Balance: number;
  Memo: string;
  TxnDate: string;
  SyncToken: string;
  isPaid: boolean;
}

interface DuplicateGroup {
  key: string;
  docNumber: string;
  vendorName: string;
  bills: BillSummary[];
  keep: BillSummary;
  toDelete: BillSummary[];
}

function summarizeBill(bill: any): BillSummary {
  return {
    Id: bill.Id,
    DocNumber: bill.DocNumber || '',
    VendorName: bill.VendorRef?.name || 'Unknown',
    VendorRef: bill.VendorRef?.value || '',
    TotalAmt: bill.TotalAmt ?? 0,
    Balance: bill.Balance ?? 0,
    Memo: bill.PrivateNote || '',
    TxnDate: bill.TxnDate || '',
    SyncToken: bill.SyncToken || '0',
    isPaid: (bill.Balance ?? 0) === 0,
  };
}

function findDuplicates(bills: BillSummary[]): DuplicateGroup[] {
  const groups = new Map<string, BillSummary[]>();

  for (const bill of bills) {
    if (!bill.DocNumber) continue;
    const key = `${bill.DocNumber}__${bill.VendorRef}`;
    const existing = groups.get(key) || [];
    existing.push(bill);
    groups.set(key, existing);
  }

  const duplicates: DuplicateGroup[] = [];

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;

    const paidBills = group.filter(b => b.isPaid);
    const unpaidBills = group.filter(b => !b.isPaid);

    let keep: BillSummary;
    let toDelete: BillSummary[];

    if (paidBills.length > 0) {
      // Keep the first paid bill; all unpaid duplicates are safe to delete
      keep = paidBills[0];
      toDelete = unpaidBills;
      // If multiple paid duplicates exist, we leave those alone (too dangerous)
    } else {
      // All unpaid — keep the oldest (earliest TxnDate), delete the rest
      const sorted = [...unpaidBills].sort(
        (a, b) => new Date(a.TxnDate).getTime() - new Date(b.TxnDate).getTime()
      );
      keep = sorted[0];
      toDelete = sorted.slice(1);
    }

    if (toDelete.length > 0) {
      duplicates.push({
        key,
        docNumber: group[0].DocNumber,
        vendorName: group[0].VendorName,
        bills: group,
        keep,
        toDelete,
      });
    }
  }

  return duplicates;
}

/**
 * GET — dry-run: show which duplicate bills would be deleted
 */
export async function GET(_req: NextRequest) {
  try {
    const allBills = await qboClient.queryBillsByMemo('PCS AI');

    const summaries = allBills.map(summarizeBill);
    const duplicates = findDuplicates(summaries);

    const totalToDelete = duplicates.reduce((sum, g) => sum + g.toDelete.length, 0);

    return NextResponse.json({
      ok: true,
      dryRun: true,
      totalBillsScanned: summaries.length,
      duplicateGroups: duplicates.length,
      billsToDelete: totalToDelete,
      billsToKeep: duplicates.reduce((s, g) => s + 1, 0),
      details: duplicates.map(g => ({
        docNumber: g.docNumber,
        vendorName: g.vendorName,
        totalInGroup: g.bills.length,
        keeping: {
          id: g.keep.Id,
          amount: g.keep.TotalAmt,
          date: g.keep.TxnDate,
          isPaid: g.keep.isPaid,
        },
        deleting: g.toDelete.map(b => ({
          id: b.Id,
          amount: b.TotalAmt,
          date: b.TxnDate,
          isPaid: b.isPaid,
        })),
      })),
    });
  } catch (error: any) {
    console.error('❌ Cleanup dry-run error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to scan for duplicates' }, { status: 500 });
  }
}

/**
 * POST — execute: delete unpaid duplicate bills from QBO
 */
export async function POST(_req: NextRequest) {
  try {
    const allBills = await qboClient.queryBillsByMemo('PCS AI');

    const summaries = allBills.map(summarizeBill);
    const duplicates = findDuplicates(summaries);

    const results: { billId: string; docNumber: string; status: string; error?: string }[] = [];

    for (const group of duplicates) {
      for (const bill of group.toDelete) {
        if (bill.isPaid) {
          results.push({ billId: bill.Id, docNumber: bill.DocNumber, status: 'skipped-paid' });
          continue;
        }

        try {
          await qboClient.deleteBill(bill.Id, bill.SyncToken);
          results.push({ billId: bill.Id, docNumber: bill.DocNumber, status: 'deleted' });
          console.log(`🗑️ Deleted duplicate bill ${bill.Id} (DocNumber: ${bill.DocNumber})`);
        } catch (err: any) {
          const msg = err?.message || String(err);
          results.push({ billId: bill.Id, docNumber: bill.DocNumber, status: 'error', error: msg });
          console.error(`❌ Failed to delete bill ${bill.Id}:`, msg);
        }
      }
    }

    const deleted = results.filter(r => r.status === 'deleted').length;
    const skipped = results.filter(r => r.status === 'skipped-paid').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      ok: true,
      deleted,
      skipped,
      errors,
      results,
    });
  } catch (error: any) {
    console.error('❌ Cleanup execution error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to execute cleanup' }, { status: 500 });
  }
}
