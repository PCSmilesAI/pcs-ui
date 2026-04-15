import { NextRequest, NextResponse } from 'next/server';
import { qboClient } from '@/lib/qbo/qboClient';
import { resolveAccountByFullName, resolveClassByFullName, clearLookupCaches } from '@/lib/qbo/qboLookup';
import { getDatabase } from '@/lib/db/client';

interface RemediationResult {
  invoiceId: string;
  qboBillId: string;
  vendor: string;
  invoiceNumber: string;
  categoryName: string;
  className: string | null;
  oldAccountRef: { value: string; name: string } | null;
  newAccountRef: { value: string; name: string } | null;
  newClassRef: { value: string } | null;
  status: 'updated' | 'skipped-correct' | 'skipped-no-resolve' | 'skipped-not-found' | 'error';
  error?: string;
}

const COGS_NAMES = ['cost of goods sold', 'purchases', 'cost of sales'];

function isCOGS(accountName: string): boolean {
  const lower = (accountName || '').toLowerCase();
  return COGS_NAMES.some(name => lower.includes(name));
}

/**
 * GET  = dry-run preview (shows what would change)
 * POST = execute remediation (actually updates QBO bills)
 */
export async function GET(req: NextRequest) {
  return handleRemediation(req, true);
}

export async function POST(req: NextRequest) {
  return handleRemediation(req, false);
}

async function handleRemediation(req: NextRequest, dryRun: boolean) {
  try {
    await qboClient.initialize();
    clearLookupCaches();

    const db = getDatabase();

    const rows = db.prepare(`
      SELECT 
        i.id as invoice_id,
        i.qbo_bill_id,
        i.vendor_name,
        i.invoice_number,
        ic.category_name,
        ic.class_name,
        ic.class_id,
        ic.amount_cents
      FROM invoices i
      JOIN invoice_categories ic ON ic.invoice_id = i.id
      WHERE i.qbo_bill_id IS NOT NULL 
        AND i.deleted = 0
      ORDER BY i.created_at DESC
    `).all() as Array<{
      invoice_id: string;
      qbo_bill_id: string;
      vendor_name: string;
      invoice_number: string;
      category_name: string;
      class_name: string | null;
      class_id: string | null;
      amount_cents: number | null;
    }>;

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.qbo_bill_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    const results: RemediationResult[] = [];
    let updatedCount = 0;
    let skippedCorrect = 0;
    let errorCount = 0;

    for (const [qboBillId, invoiceRows] of grouped) {
      const first = invoiceRows[0];

      const resolvedAccounts: Array<{
        row: typeof first;
        account: { id: string; name: string; fullName: string; type: string } | undefined;
        classRef: { id: string } | undefined;
      }> = [];

      for (const row of invoiceRows) {
        const account = await resolveAccountByFullName(row.category_name);
        let classRef = row.class_id ? await resolveClassByFullName(row.class_id) : undefined;
        if (!classRef && row.class_name) {
          classRef = await resolveClassByFullName(row.class_name);
        }
        resolvedAccounts.push({ row, account, classRef });
      }

      const hasResolvable = resolvedAccounts.some(r => r.account);
      if (!hasResolvable) {
        for (const { row } of resolvedAccounts) {
          results.push({
            invoiceId: row.invoice_id,
            qboBillId: row.qbo_bill_id,
            vendor: row.vendor_name,
            invoiceNumber: row.invoice_number,
            categoryName: row.category_name,
            className: row.class_name,
            oldAccountRef: null,
            newAccountRef: null,
            newClassRef: null,
            status: 'skipped-no-resolve',
          });
        }
        continue;
      }

      try {
        const fullBill = await qboClient.getFullBill(qboBillId);
        if (!fullBill) {
          for (const { row } of resolvedAccounts) {
            results.push({
              invoiceId: row.invoice_id,
              qboBillId: row.qbo_bill_id,
              vendor: row.vendor_name,
              invoiceNumber: row.invoice_number,
              categoryName: row.category_name,
              className: row.class_name,
              oldAccountRef: null,
              newAccountRef: null,
              newClassRef: null,
              status: 'skipped-not-found',
            });
          }
          continue;
        }

        const lines: any[] = fullBill.Line || [];
        let billModified = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.DetailType !== 'AccountBasedExpenseLineDetail') continue;

          const currentRef = line.AccountBasedExpenseLineDetail?.AccountRef;
          const currentName = currentRef?.name || '';

          const resolved = resolvedAccounts[0];
          const matchingResolved = resolvedAccounts.length > i
            ? resolvedAccounts[i]
            : resolved;

          if (!matchingResolved?.account) continue;

          const alreadyCorrect =
            currentRef?.value === matchingResolved.account.id ||
            currentName.toLowerCase() === matchingResolved.account.fullName.toLowerCase();

          if (alreadyCorrect) {
            results.push({
              invoiceId: matchingResolved.row.invoice_id,
              qboBillId,
              vendor: first.vendor_name,
              invoiceNumber: first.invoice_number,
              categoryName: matchingResolved.row.category_name,
              className: matchingResolved.row.class_name,
              oldAccountRef: currentRef ? { value: currentRef.value, name: currentName } : null,
              newAccountRef: null,
              newClassRef: null,
              status: 'skipped-correct',
            });
            skippedCorrect++;
            continue;
          }

          const oldRef = currentRef ? { value: currentRef.value, name: currentName } : null;

          line.AccountBasedExpenseLineDetail.AccountRef = {
            value: matchingResolved.account.id,
            name: matchingResolved.account.fullName,
          };

          if (matchingResolved.classRef?.id && /^\d+$/.test(matchingResolved.classRef.id)) {
            line.AccountBasedExpenseLineDetail.ClassRef = {
              value: matchingResolved.classRef.id,
            };
          }

          billModified = true;
          results.push({
            invoiceId: matchingResolved.row.invoice_id,
            qboBillId,
            vendor: first.vendor_name,
            invoiceNumber: first.invoice_number,
            categoryName: matchingResolved.row.category_name,
            className: matchingResolved.row.class_name,
            oldAccountRef: oldRef,
            newAccountRef: {
              value: matchingResolved.account.id,
              name: matchingResolved.account.fullName,
            },
            newClassRef: matchingResolved.classRef?.id ? { value: matchingResolved.classRef.id } : null,
            status: 'updated',
          });
        }

        if (billModified && !dryRun) {
          await qboClient.updateBill({
            Id: fullBill.Id,
            SyncToken: fullBill.SyncToken,
            sparse: true,
            Line: fullBill.Line,
          });
          updatedCount++;
          await new Promise(resolve => setTimeout(resolve, 300));
        } else if (billModified) {
          updatedCount++;
        }
      } catch (error: any) {
        errorCount++;
        for (const { row } of resolvedAccounts) {
          results.push({
            invoiceId: row.invoice_id,
            qboBillId: row.qbo_bill_id,
            vendor: row.vendor_name,
            invoiceNumber: row.invoice_number,
            categoryName: row.category_name,
            className: row.class_name,
            oldAccountRef: null,
            newAccountRef: null,
            newClassRef: null,
            status: 'error',
            error: error?.message || 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({
      dryRun,
      summary: {
        totalBills: grouped.size,
        totalLines: results.length,
        wouldUpdate: results.filter(r => r.status === 'updated').length,
        alreadyCorrect: skippedCorrect,
        noResolve: results.filter(r => r.status === 'skipped-no-resolve').length,
        notFound: results.filter(r => r.status === 'skipped-not-found').length,
        errors: errorCount,
      },
      results,
    });
  } catch (error: any) {
    console.error('[REMEDIATE] Fatal error:', error);
    return NextResponse.json(
      { error: error?.message || 'Remediation failed' },
      { status: 500 }
    );
  }
}
