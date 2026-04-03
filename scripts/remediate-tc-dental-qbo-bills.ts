/**
 * Find QuickBooks Bills for TC Dental Lab vendors from a start date onward;
 * fix line items that post to Cost of Goods Sold by moving them to the target Lab Fees expense account.
 *
 * Usage (repo root):
 *   npx tsx scripts/remediate-tc-dental-qbo-bills.ts --dry-run
 *   npx tsx scripts/remediate-tc-dental-qbo-bills.ts --apply
 *
 * Env:
 *   QBO_REMEDIATE_SINCE=2026-03-01   (default 2026-03-01)
 *   QBO_TARGET_LAB_ACCOUNT=52210 Dental Lab Fees   (passed to resolveAccountByFullName)
 *
 * Paid bills (Balance === 0) are skipped — QBO often blocks line edits after payment.
 */
import 'dotenv/config';
import path from 'path';
import Database from 'better-sqlite3';
import { qboClient } from '../lib/qbo/qboClient';
import { resolveAccountByFullName } from '../lib/qbo/qboLookup';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;

const SINCE = process.env.QBO_REMEDIATE_SINCE || '2026-03-01';
const TARGET_HINT = process.env.QBO_TARGET_LAB_ACCOUNT || '52210 Dental Lab Fees';

function tcDentalVendorName(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('tc dental') || n.includes('tcdental') || n.includes('tc_dental');
}

function lineNeedsCogsFix(
  line: any,
  accountTypeById: Map<string, string>
): boolean {
  if (line?.DetailType !== 'AccountBasedExpenseLineDetail') return false;
  const id = line?.AccountBasedExpenseLineDetail?.AccountRef?.value;
  if (!id) return false;
  const t = accountTypeById.get(String(id)) || '';
  return t === 'Cost of Goods Sold';
}

async function fetchAllBillsForVendor(vendorId: string): Promise<any[]> {
  const all: any[] = [];
  let start = 1;
  const page = 100;
  for (;;) {
    const sql = `SELECT * FROM Bill WHERE TxnDate >= '${SINCE}' AND VendorRef = '${vendorId}' STARTPOSITION ${start} MAXRESULTS ${page}`;
    const res = await qboClient.executeQuery<any>(sql);
    const batch = res?.QueryResponse?.Bill || [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < page) break;
    start += page;
  }
  return all;
}

async function main() {
  console.log('[remediate] mode:', dryRun ? 'DRY-RUN' : 'APPLY');
  console.log('[remediate] TxnDate >=', SINCE, '| target account hint:', TARGET_HINT);

  try {
    await qboClient.initialize();
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('No QuickBooks tokens') || msg.includes('connect')) {
      console.warn('[remediate] SKIP: QuickBooks not connected (no tokens). Run on server with pcs_ai_data/qbo_tokens.db.');
      process.exit(0);
    }
    throw e;
  }

  const target = await resolveAccountByFullName(TARGET_HINT);
  if (!target?.id) {
    console.error('[remediate] Could not resolve target account in QBO:', TARGET_HINT);
    process.exit(1);
  }
  if (target.type === 'Cost of Goods Sold') {
    console.error('[remediate] Target account is COGS — pick an Expense account (e.g. Dental Lab Fees).');
    process.exit(1);
  }

  console.log('[remediate] Target QBO account:', target.id, target.fullName, `(${target.type})`);

  const accounts = await qboClient.getAllAccounts();
  const accountTypeById = new Map<string, string>();
  for (const a of accounts) {
    accountTypeById.set(a.id, a.type);
  }

  const vendorRes = await qboClient.executeQuery<any>(
    "SELECT Id, DisplayName FROM Vendor WHERE Active = true MAXRESULTS 500"
  );
  const vendors: Array<{ Id: string; DisplayName: string }> = vendorRes?.QueryResponse?.Vendor || [];
  const tcVendors = vendors.filter((v) => tcDentalVendorName(v.DisplayName));
  if (tcVendors.length === 0) {
    console.log('[remediate] No active QBO vendors matched TC Dental pattern.');
    process.exit(0);
  }

  console.log(
    '[remediate] Vendors:',
    tcVendors.map((v) => `${v.DisplayName} (${v.Id})`).join(', ')
  );

  let examined = 0;
  let wouldFix = 0;
  let fixed = 0;
  let skippedPaid = 0;
  let errors = 0;

  const pcsDbPath = path.resolve(process.cwd(), 'pcs_ui_data/pcs.db');
  let invByBillId = new Map<string, { invoice_number: string; id: string }>();
  try {
    const db = new Database(pcsDbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT id, invoice_number, qbo_bill_id FROM invoices WHERE qbo_bill_id IS NOT NULL AND qbo_bill_id != ''`
      )
      .all() as Array<{ id: string; invoice_number: string; qbo_bill_id: string }>;
    for (const r of rows) {
      invByBillId.set(String(r.qbo_bill_id), { id: r.id, invoice_number: r.invoice_number });
    }
    db.close();
  } catch {
    invByBillId = new Map();
  }

  for (const v of tcVendors) {
    const bills = await fetchAllBillsForVendor(v.Id);
    for (const bill of bills) {
      examined++;
      const balance = Number(bill.Balance ?? 0);
      const total = Number(bill.TotalAmt ?? 0);
      if (balance === 0 && total > 0) {
        skippedPaid++;
        console.log(
          '[remediate] SKIP paid (Balance=0):',
          bill.Id,
          bill.DocNumber,
          invByBillId.get(String(bill.Id))?.invoice_number || ''
        );
        continue;
      }

      const lines: any[] = Array.isArray(bill.Line) ? bill.Line : [];
      const fixFlags = lines.map((ln) => lineNeedsCogsFix(ln, accountTypeById));
      if (!fixFlags.some(Boolean)) {
        continue;
      }

      wouldFix++;
      const invInfo = invByBillId.get(String(bill.Id));
      console.log(
        '[remediate] FIX candidate:',
        bill.Id,
        'DocNumber:',
        bill.DocNumber,
        'TxnDate:',
        bill.TxnDate,
        invInfo ? `PCS:${invInfo.invoice_number}` : ''
      );

      const newLines = lines.map((ln, i) => {
        if (!fixFlags[i]) return ln;
        const det = ln.AccountBasedExpenseLineDetail || {};
        return {
          ...ln,
          AccountBasedExpenseLineDetail: {
            ...det,
            AccountRef: {
              value: target.id,
              name: target.fullName || target.name,
            },
          },
        };
      });

      if (dryRun) {
        continue;
      }

      try {
        await qboClient.updateBill({
          Id: bill.Id,
          SyncToken: bill.SyncToken,
          sparse: true,
          VendorRef: bill.VendorRef,
          Line: newLines,
        });
        fixed++;
        console.log('[remediate] Updated bill', bill.Id);
      } catch (e: any) {
        errors++;
        console.error('[remediate] updateBill failed', bill.Id, e?.message || e);
      }
    }
  }

  console.log('[remediate] summary:', {
    examined,
    candidatesWithCogsLines: wouldFix,
    updated: fixed,
    skippedPaid,
    errors,
  });

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
