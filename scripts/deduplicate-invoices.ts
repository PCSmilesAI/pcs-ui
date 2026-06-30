/**
 * Deduplicate invoices that share the same invoice_number.
 *
 * Keeps the best copy per group:
 *  1. Has qbo_bill_id (QBO bill already created)
 *  2. Correct vendor (not "Unknown")
 *  3. Furthest workflow status (paid > to_be_paid > awaiting > incoming)
 *  4. Highest status_version / most recently updated
 *
 * Usage:
 *   npx tsx scripts/deduplicate-invoices.ts --dry-run
 *   npx tsx scripts/deduplicate-invoices.ts --apply
 */
import { getDatabase } from '../lib/db/client';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;

interface InvoiceRow {
  id: string;
  invoice_number: string;
  vendor_name: string | null;
  status: string | null;
  qbo_bill_id: string | null;
  status_version: number | null;
  updated_at: string | null;
  created_at: string | null;
  amount_cents: number | null;
}

function statusRank(status: string | null): number {
  const s = (status || '').toLowerCase();
  if (s === 'paid' || s === 'completed') return 100;
  if (s === 'to_be_paid') return 90;
  if (s === 'awaiting_admin_approval') return 80;
  if (s === 'categorized') return 70;
  if (s === 'incoming') return 50;
  if (s === 'pending_review') return 40;
  return 0;
}

function scoreInvoice(inv: InvoiceRow): number {
  let score = 0;
  if (inv.qbo_bill_id && String(inv.qbo_bill_id).trim()) score += 1_000_000;
  const vendor = (inv.vendor_name || '').trim();
  if (vendor && vendor.toLowerCase() !== 'unknown') score += 100_000;
  score += statusRank(inv.status) * 1_000;
  score += inv.status_version || 0;
  const updated = inv.updated_at ? Date.parse(inv.updated_at.replace(' ', 'T')) : 0;
  score += Math.floor(updated / 1_000_000); // small tiebreaker
  return score;
}

function pickWinner(group: InvoiceRow[]): InvoiceRow {
  return [...group].sort((a, b) => scoreInvoice(b) - scoreInvoice(a))[0];
}

function main() {
  const db = getDatabase();
  const now = new Date().toISOString();

  const dupNumbers = db.prepare(`
    SELECT invoice_number
    FROM invoices
    WHERE deleted = 0
    GROUP BY invoice_number
    HAVING COUNT(*) > 1
  `).all() as { invoice_number: string }[];

  console.log(`[dedupe] mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[dedupe] duplicate invoice_number groups: ${dupNumbers.length}`);

  const plan: Array<{ invoice_number: string; keep: InvoiceRow; remove: InvoiceRow[] }> = [];

  for (const { invoice_number } of dupNumbers) {
    const group = db.prepare(`
      SELECT id, invoice_number, vendor_name, status, qbo_bill_id, status_version, updated_at, created_at, amount_cents
      FROM invoices
      WHERE deleted = 0 AND invoice_number = ?
    `).all(invoice_number) as InvoiceRow[];

    if (group.length < 2) continue;

    const keep = pickWinner(group);
    const remove = group.filter((r) => r.id !== keep.id);
    plan.push({ invoice_number, keep, remove });
  }

  let removeCount = 0;
  let bothHaveBill = 0;

  for (const { invoice_number, keep, remove } of plan) {
    const keepHasBill = !!(keep.qbo_bill_id && String(keep.qbo_bill_id).trim());
    const removedWithBill = remove.filter((r) => r.qbo_bill_id && String(r.qbo_bill_id).trim());
    if (keepHasBill && removedWithBill.length > 0) bothHaveBill++;

    console.log(`\n[dedupe] ${invoice_number}:`);
    console.log(`  KEEP  ${keep.id.slice(0, 8)}… | ${keep.vendor_name} | ${keep.status} | qbo=${keep.qbo_bill_id || '—'}`);
    for (const r of remove) {
      console.log(`  REMOVE ${r.id.slice(0, 8)}… | ${r.vendor_name} | ${r.status} | qbo=${r.qbo_bill_id || '—'}`);
      removeCount++;
    }

    if (!apply) continue;

    for (const r of remove) {
      db.prepare(`
        UPDATE invoices
        SET deleted = 1, workflow_deleted_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(now, r.id);

      db.prepare(`
        INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
        VALUES (?, 'DEDUP_REMOVED', 'system@dedupe-script', ?)
      `).run(
        r.id,
        JSON.stringify({
          reason: 'duplicate_invoice_number',
          invoice_number,
          kept_invoice_id: keep.id,
          kept_vendor: keep.vendor_name,
          kept_qbo_bill_id: keep.qbo_bill_id,
          removed_qbo_bill_id: r.qbo_bill_id,
        })
      );
    }
  }

  console.log(`\n[dedupe] summary:`);
  console.log(`  groups processed: ${plan.length}`);
  console.log(`  invoices to remove: ${removeCount}`);
  console.log(`  groups where both copies had QBO bills (kept best): ${bothHaveBill}`);

  if (dryRun) {
    console.log('\n[dedupe] Re-run with --apply to execute.');
  } else {
    console.log('\n[dedupe] Done.');
  }
}

main();
