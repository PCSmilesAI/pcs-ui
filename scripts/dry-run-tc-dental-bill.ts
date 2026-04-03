/**
 * Dry-run QBO bill build for a TC Dental invoice with 2+ GL lines.
 * Verifies post-fix behavior: distinct account IDs when categories resolve to different accounts.
 *
 * Usage (from repo root): npx tsx scripts/dry-run-tc-dental-bill.ts
 * Requires: .env QBO tokens, local pcs_ui_data/pcs.db with matching invoice.
 */
import 'dotenv/config';
import { getDatabase } from '../lib/db/client';
import { createBillFromInvoice } from '../lib/qbo/billCreationService';
import { getInvoiceCategories } from '../lib/invoices/categoryParser';

async function main() {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT id, vendor_name, amount_cents, invoice_number, office_id
    FROM invoices
    WHERE deleted = 0
      AND (LOWER(vendor_name) LIKE 'tc dental%' OR LOWER(vendor_name) LIKE '%tc dental lab%')
      AND id IN (
        SELECT invoice_id FROM invoice_categories GROUP BY invoice_id HAVING COUNT(*) >= 2
      )
    LIMIT 1
  `
    )
    .get() as {
    id: string;
    vendor_name: string;
    amount_cents: number;
    invoice_number: string;
    office_id: string | null;
  } | undefined;

  if (!row) {
    console.log('SKIP: No TC Dental invoice with 2+ GL lines in local DB.');
    process.exit(0);
  }

  const cats = getInvoiceCategories(row.id);
  if (cats.length < 2) {
    console.log('SKIP: invoice_categories count < 2');
    process.exit(0);
  }

  const distinctNames = new Set(cats.map((c) => c.categoryName.trim()));
  console.log('Invoice', row.id, row.vendor_name, 'GL lines:', cats.length, 'distinct category_name:', distinctNames.size);

  const result = await createBillFromInvoice({
    invoiceId: row.id,
    invoiceData: {
      id: row.id,
      vendor_name: row.vendor_name,
      invoice_number: row.invoice_number,
      office_id: row.office_id || undefined,
      amount_cents: row.amount_cents,
      total: row.amount_cents / 100,
    },
    totalAmount: row.amount_cents / 100,
    dryRun: true,
  });

  if (!result.success) {
    console.error('DRYRUN failed:', result.error);
    process.exit(1);
  }

  const accts = (result.accounts || []).filter(Boolean) as string[];
  const uniqueAccts = new Set(accts);
  console.log('Dry-run account IDs per line:', accts);

  if (distinctNames.size >= 2 && uniqueAccts.size >= 2) {
    console.log('OK: Multiple GL categories and multiple distinct QBO account IDs.');
    process.exit(0);
  }

  if (distinctNames.size >= 2 && uniqueAccts.size === 1) {
    console.error(
      'FAIL: Multiple category_name values but a single QBO account on all lines — check __preserveResolvedAccount / vendor override.'
    );
    process.exit(1);
  }

  console.log('OK: Single-category or single-account case.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
