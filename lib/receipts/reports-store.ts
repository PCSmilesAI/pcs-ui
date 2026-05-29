/**
 * lib/receipts/reports-store.ts
 *
 * Expense reports: a bundle of receipts submitted together and moved through
 * submitted → approved → closed. Receipts link to a report via receipts.report_id.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/client';
import { getReceiptById, type Receipt } from './db-store';

export type ReportStatus = 'submitted' | 'approved' | 'closed';

export interface ExpenseReport {
  id: string;
  display_number: number;
  submitted_by: string;
  submitted_at: string;
  status: ReportStatus;
  approver_email: string | null;
  approved_at: string | null;
  closed_at: string | null;
  total_amount: number;
  expense_count: number;
  notes: string;
  qbo_purchase_id: string | null;
  qbo_exported_at: string | null;
  qbo_export_error: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextDisplayNumber(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT MAX(display_number) AS n FROM expense_reports').get() as { n: number | null };
  return (row?.n ?? 0) + 1;
}

export function listReports(status?: ReportStatus): ExpenseReport[] {
  const db = getDatabase();
  if (status) {
    return db
      .prepare('SELECT * FROM expense_reports WHERE status = ? ORDER BY datetime(submitted_at) DESC')
      .all(status) as ExpenseReport[];
  }
  return db
    .prepare('SELECT * FROM expense_reports ORDER BY datetime(submitted_at) DESC')
    .all() as ExpenseReport[];
}

export function getReportStatusCounts(): Record<ReportStatus, number> {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM expense_reports GROUP BY status')
    .all() as Array<{ status: ReportStatus; n: number }>;
  const counts: Record<ReportStatus, number> = { submitted: 0, approved: 0, closed: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status] = r.n;
  return counts;
}

export function getReportById(id: string): (ExpenseReport & { receipts: Receipt[] }) | null {
  const db = getDatabase();
  const report = db.prepare('SELECT * FROM expense_reports WHERE id = ?').get(id) as
    | ExpenseReport
    | undefined;
  if (!report) return null;
  const receipts = db
    .prepare('SELECT * FROM receipts WHERE report_id = ? ORDER BY datetime(created_at) DESC')
    .all(id) as Receipt[];
  return { ...report, receipts };
}

/**
 * Create a report from a set of receipt IDs: stamps receipts.report_id and
 * computes totals. Skips receipts that don't exist or are already on a report.
 */
export function createReport(data: {
  submitted_by: string;
  receiptIds: string[];
  notes?: string;
}): ExpenseReport & { receipts: Receipt[] } {
  const db = getDatabase();
  const now = nowIso();
  const id = randomUUID();

  const valid = (data.receiptIds || [])
    .map((rid) => getReceiptById(rid))
    .filter((r): r is Receipt => !!r && !r.report_id);

  const total = valid.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO expense_reports
         (id, display_number, submitted_by, submitted_at, status, approver_email,
          approved_at, closed_at, total_amount, expense_count, notes, created_at, updated_at)
       VALUES (@id, @display_number, @submitted_by, @now, 'submitted', NULL,
          NULL, NULL, @total, @count, @notes, @now, @now)`
    ).run({
      id,
      display_number: nextDisplayNumber(),
      submitted_by: data.submitted_by,
      total: Math.round(total * 100) / 100,
      count: valid.length,
      notes: data.notes ?? '',
      now,
    });
    const link = db.prepare('UPDATE receipts SET report_id = ?, updated_at = ? WHERE id = ?');
    for (const r of valid) link.run(id, now, r.id);
  });
  tx();

  return getReportById(id)!;
}

export function updateReportStatus(
  id: string,
  data: { status: ReportStatus; approver_email?: string }
): (ExpenseReport & { receipts: Receipt[] }) | null {
  const db = getDatabase();
  const existing = getReportById(id);
  if (!existing) return null;
  const now = nowIso();
  db.prepare(
    `UPDATE expense_reports
     SET status = @status,
         approver_email = COALESCE(@approver_email, approver_email),
         approved_at = CASE WHEN @status = 'approved' THEN @now ELSE approved_at END,
         closed_at = CASE WHEN @status = 'closed' THEN @now ELSE closed_at END,
         updated_at = @now
     WHERE id = @id`
  ).run({ id, status: data.status, approver_email: data.approver_email ?? null, now });
  return getReportById(id);
}

/** Record the outcome of a QBO export attempt. On success also closes the report. */
export function setReportQboResult(
  id: string,
  result: { purchaseId?: string | null; error?: string | null }
): (ExpenseReport & { receipts: Receipt[] }) | null {
  const db = getDatabase();
  if (!getReportById(id)) return null;
  const now = nowIso();
  if (result.purchaseId) {
    db.prepare(
      `UPDATE expense_reports
       SET qbo_purchase_id = @pid, qbo_exported_at = @now, qbo_export_error = NULL,
           status = 'closed', closed_at = @now, updated_at = @now
       WHERE id = @id`
    ).run({ id, pid: result.purchaseId, now });
  } else {
    db.prepare(
      `UPDATE expense_reports SET qbo_export_error = @err, updated_at = @now WHERE id = @id`
    ).run({ id, err: result.error ?? 'Unknown error', now });
  }
  return getReportById(id);
}
