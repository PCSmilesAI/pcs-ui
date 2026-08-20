/**
 * Backfill invoices.submitted_by_email from ingest_reports.created_json.
 *
 * Walks ingest reports oldest → newest and sets submitted_by_email on invoices
 * that do not yet have one.
 *
 * Usage:
 *   npx tsx scripts/backfill-submitted-by-email.ts --dry-run
 *   npx tsx scripts/backfill-submitted-by-email.ts --apply
 */
import { getDatabase } from '../lib/db/client';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;

type CreatedEntry = {
  invoice_number?: string;
  id?: string;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = (email || '').trim().toLowerCase();
  return normalized || null;
}

function main() {
  const db = getDatabase();
  const reports = db.prepare(`
    SELECT sender_email, created_json, created_at
    FROM ingest_reports
    WHERE sender_email IS NOT NULL AND TRIM(sender_email) != ''
      AND created_json IS NOT NULL AND TRIM(created_json) != ''
    ORDER BY created_at ASC
  `).all() as Array<{
    sender_email: string;
    created_json: string;
    created_at: string;
  }>;

  const updateStmt = db.prepare(`
    UPDATE invoices
    SET submitted_by_email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE deleted = 0
      AND invoice_number = ?
      AND (submitted_by_email IS NULL OR TRIM(submitted_by_email) = '')
  `);

  let updated = 0;
  let skippedReports = 0;

  for (const report of reports) {
    const sender = normalizeEmail(report.sender_email);
    if (!sender) continue;

    let created: CreatedEntry[] = [];
    try {
      created = JSON.parse(report.created_json);
    } catch {
      skippedReports += 1;
      continue;
    }

    if (!Array.isArray(created) || created.length === 0) continue;

    for (const entry of created) {
      const invoiceNumber = (entry.invoice_number || entry.id || '').trim();
      if (!invoiceNumber) continue;

      if (dryRun) {
        const row = db.prepare(`
          SELECT invoice_number, submitted_by_email
          FROM invoices
          WHERE deleted = 0 AND invoice_number = ?
          LIMIT 1
        `).get(invoiceNumber) as { invoice_number: string; submitted_by_email: string | null } | undefined;

        if (row && !normalizeEmail(row.submitted_by_email)) {
          console.log(`[dry-run] ${invoiceNumber} -> ${sender} (from ${report.created_at})`);
          updated += 1;
        }
        continue;
      }

      const result = updateStmt.run(sender, invoiceNumber);
      if (result.changes > 0) {
        updated += result.changes;
        console.log(`[apply] ${invoiceNumber} -> ${sender}`);
      }
    }
  }

  console.log('');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`Reports scanned: ${reports.length}`);
  console.log(`Invoices updated: ${updated}`);
  if (skippedReports > 0) {
    console.log(`Reports with invalid created_json: ${skippedReports}`);
  }

  const remaining = db.prepare(`
    SELECT COUNT(*) as c FROM invoices
    WHERE deleted = 0
      AND (submitted_by_email IS NULL OR TRIM(submitted_by_email) = '')
  `).get() as { c: number };

  console.log(`Invoices still missing submitted_by_email: ${remaining.c}`);
}

main();
