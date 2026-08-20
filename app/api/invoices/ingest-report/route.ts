import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDatabase } from '../../../../lib/db/client';
import {
  composeIngestReportMessage,
  mapStatusToLocation,
  buildNotificationTitle,
  buildSkippedBySubmitterPayload,
  type CreatedFact,
  type SkippedFact,
  type IngestReportFacts,
} from '../../../../lib/gpt/composeIngestReport';

export const dynamic = 'force-dynamic';

interface IngestReportPayload {
  email_key?: string;
  message_id?: string;
  sender_email?: string;
  sender_raw?: string;
  subject?: string;
  pdf_count?: number;
  invoices_detected?: number;
  created?: Array<{ id?: string; invoice_number?: string; vendor?: string; amount?: number }>;
  skipped?: Array<{
    invoice_number?: string;
    existing_id?: string;
    existing_status?: string | null;
    existing_assigned_to?: string | null;
    existing_submitted_by?: string | null;
    existing_submitted_at?: string | null;
    reason?: string;
  }>;
  failed?: Array<{ reason?: string }>;
  unaccounted?: number;
  status?: 'ok' | 'partial' | 'failed';
}

function enrichSkippedFromDb(
  db: ReturnType<typeof getDatabase>,
  skipped: IngestReportPayload['skipped']
): SkippedFact[] {
  const stmt = db.prepare(
    `SELECT id, invoice_number, status, current_assigned_user_email, vendor_name,
            submitted_by_email, created_at
     FROM invoices WHERE deleted = 0 AND (id = ? OR invoice_number = ?)
     LIMIT 1`
  );

  return (skipped || []).map((s) => {
    const row = stmt.get(s.existing_id || '', s.invoice_number || '') as
      | {
          id: string;
          invoice_number: string;
          status?: string;
          current_assigned_user_email?: string | null;
          vendor_name?: string;
          submitted_by_email?: string | null;
          created_at?: string | null;
        }
      | undefined;

    const status = row?.status ?? s.existing_status ?? null;
    const assigned = row?.current_assigned_user_email ?? s.existing_assigned_to ?? null;
    const originalSubmittedBy =
      (row?.submitted_by_email || s.existing_submitted_by || null)?.trim().toLowerCase() || null;
    const originalSubmittedAt = row?.created_at ?? s.existing_submitted_at ?? null;

    return {
      invoice_number: s.invoice_number || row?.invoice_number || s.existing_id || 'unknown',
      location: mapStatusToLocation(status, assigned),
      existing_status: status,
      existing_assigned_to: assigned,
      original_submitted_by: originalSubmittedBy,
      original_submitted_at: originalSubmittedAt,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IngestReportPayload;
    const senderEmail = (body.sender_email || '').trim().toLowerCase();
    const subject = body.subject || '';
    const status = body.status || 'ok';
    const createdRaw = body.created || [];
    const failed = body.failed || [];
    const unaccounted = body.unaccounted || 0;

    const db = getDatabase();
    const skipped = enrichSkippedFromDb(db, body.skipped);

    const created: CreatedFact[] = createdRaw.map((c) => ({
      invoice_number: c.invoice_number || c.id || 'unknown',
      vendor: c.vendor || null,
      amount: typeof c.amount === 'number' ? c.amount : null,
    }));

    const facts: IngestReportFacts = {
      sender_email: senderEmail,
      subject,
      status,
      created,
      skipped,
      failed,
      unaccounted,
      invoices_detected: body.invoices_detected ?? created.length + skipped.length,
    };

    const composed = await composeIngestReportMessage(facts);
    const reportId = randomUUID();
    const now = new Date().toISOString();
    const skippedBySubmitter = buildSkippedBySubmitterPayload(facts);
    const notificationTitle = buildNotificationTitle(facts);

    db.prepare(`
      INSERT INTO ingest_reports (
        id, email_key, message_id, sender_email, subject, received_at,
        pdf_count, invoices_detected, created_json, skipped_json, failed_json,
        status, composed_subject, composed_body, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      body.email_key || null,
      body.message_id || null,
      senderEmail || null,
      subject,
      now,
      body.pdf_count || 0,
      facts.invoices_detected,
      JSON.stringify(created),
      JSON.stringify(skipped),
      JSON.stringify(failed),
      status,
      composed.subject,
      composed.body,
      now
    );

    // Create in-app notification for the sender when we know their email
    let notificationId: string | null = null;
    if (senderEmail) {
      notificationId = randomUUID();

      db.prepare(`
        INSERT INTO notifications (id, user_email, type, title, body, payload_json, created_at)
        VALUES (?, ?, 'ingest_report', ?, ?, ?, ?)
      `).run(
        notificationId,
        senderEmail,
        notificationTitle,
        composed.body,
        JSON.stringify({
          report_id: reportId,
          created_count: created.length,
          skipped_count: skipped.length,
          unaccounted,
          status,
          created_invoice_numbers: created.map((c) => c.invoice_number),
          skipped_invoice_numbers: skipped.map((s) => s.invoice_number),
          skipped_by_submitter: skippedBySubmitter,
        }),
        now
      );
    }

    console.log('[INGEST_REPORT] Stored', {
      reportId,
      senderEmail,
      status,
      created: created.length,
      skipped: skipped.length,
      used_gpt: composed.used_gpt,
      notificationId,
      notificationTitle,
    });

    return NextResponse.json({
      ok: true,
      report_id: reportId,
      notification_id: notificationId,
      composed_subject: composed.subject,
      composed_body: composed.body,
      used_gpt: composed.used_gpt,
      created_count: created.length,
      skipped_count: skipped.length,
    });
  } catch (err: any) {
    console.error('[INGEST_REPORT] Error:', err?.message, err?.stack);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to store ingest report' },
      { status: 500 }
    );
  }
}
