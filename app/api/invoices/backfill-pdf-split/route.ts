import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { classifyDocumentPages } from '../../../../lib/gpt/parseInvoice';
import { convertPdfToImages } from '../../../../lib/gpt/pdfToImages';
import { getPdfPageCount } from '../../../../lib/gpt/pdfToImages';
import { extractPdfPages, buildPerInvoiceFilename } from '../../../../lib/pdf/extractPages';
import { buildApiPdfPath, normalizePdfFilename } from '../../../../lib/security/filename';
import { isPathWithinBase } from '../../../../lib/security/path-validation';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface InvoiceRow {
  id: string;
  invoice_number: string;
  pdf_path: string | null;
  source_file: string | null;
  document_group_id: string;
  document_invoice_index: number;
  document_invoice_total: number;
  pdf_page_start: number | null;
  status: string;
}

function resolvePdfOnDisk(pdfPath: string | null): string | null {
  if (!pdfPath) return null;

  let filename = pdfPath;
  if (pdfPath.includes('/')) {
    const parts = pdfPath.split('/');
    filename = parts[parts.length - 1] || '';
  }
  if (!filename || !filename.toLowerCase().endsWith('.pdf')) return null;

  const dataDir = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
  const inboxDataDir = process.env.INBOX_DATA_DIR || '/var/www/pcs-ui-data';
  const possiblePaths = [
    path.join(dataDir, 'email_invoices', filename),
    path.join(inboxDataDir, 'email_invoices', filename),
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      if (isPathWithinBase(p, process.cwd()) || isPathWithinBase(p, dataDir) || isPathWithinBase(p, inboxDataDir)) {
        return p;
      }
    }
  }
  return null;
}

/**
 * GET /api/invoices/backfill-pdf-split — dry-run preview
 * POST /api/invoices/backfill-pdf-split — execute the backfill
 *
 * Finds multi-invoice groups that still share a full PDF (pdf_page_start IS NULL),
 * re-runs page classification, extracts per-invoice PDFs, and updates the DB rows.
 */

async function runBackfill(execute: boolean) {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT id, invoice_number, pdf_path, source_file,
           document_group_id, document_invoice_index, document_invoice_total,
           pdf_page_start, status
    FROM invoices
    WHERE deleted = 0
      AND document_invoice_total > 1
      AND pdf_page_start IS NULL
      AND LOWER(COALESCE(status, '')) NOT IN ('to_be_paid', 'completed', 'paid', 'rejected', 'removed')
    ORDER BY document_group_id, document_invoice_index
  `).all() as InvoiceRow[];

  const groups = new Map<string, InvoiceRow[]>();
  for (const row of rows) {
    const key = row.document_group_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  console.log(`[BACKFILL] Found ${groups.size} groups, ${rows.length} invoices to process`);

  const results: Array<{
    group_id: string;
    invoice_count: number;
    pdf_found: boolean;
    clusters_match: boolean;
    page_assignments: Array<{ id: string; invoice_number: string; pages: number[] }>;
    status: string;
  }> = [];

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [groupId, invoices] of groups) {
    const firstInvoice = invoices[0];
    const resolvedPdf = resolvePdfOnDisk(firstInvoice.pdf_path);

    if (!resolvedPdf) {
      results.push({
        group_id: groupId,
        invoice_count: invoices.length,
        pdf_found: false,
        clusters_match: false,
        page_assignments: [],
        status: 'skipped_pdf_not_found',
      });
      totalSkipped += invoices.length;
      continue;
    }

    let pageCount: number;
    try {
      pageCount = getPdfPageCount(resolvedPdf);
    } catch {
      results.push({
        group_id: groupId,
        invoice_count: invoices.length,
        pdf_found: true,
        clusters_match: false,
        page_assignments: [],
        status: 'skipped_page_count_failed',
      });
      totalSkipped += invoices.length;
      continue;
    }

    let base64Images: string[];
    try {
      base64Images = await convertPdfToImages(resolvedPdf);
    } catch (err: any) {
      console.warn(`[BACKFILL] Image conversion failed for group ${groupId}:`, err?.message);
      results.push({
        group_id: groupId,
        invoice_count: invoices.length,
        pdf_found: true,
        clusters_match: false,
        page_assignments: [],
        status: 'skipped_image_conversion_failed',
      });
      totalSkipped += invoices.length;
      continue;
    }

    let clusters: number[][];
    try {
      clusters = await classifyDocumentPages(resolvedPdf, pageCount, base64Images);
    } catch (err: any) {
      console.warn(`[BACKFILL] Classification failed for group ${groupId}:`, err?.message);
      results.push({
        group_id: groupId,
        invoice_count: invoices.length,
        pdf_found: true,
        clusters_match: false,
        page_assignments: [],
        status: 'skipped_classification_failed',
      });
      totalSkipped += invoices.length;
      continue;
    }

    if (clusters.length !== invoices.length) {
      console.warn(
        `[BACKFILL] Cluster count mismatch for group ${groupId}: ${clusters.length} clusters vs ${invoices.length} invoices — skipping`
      );
      results.push({
        group_id: groupId,
        invoice_count: invoices.length,
        pdf_found: true,
        clusters_match: false,
        page_assignments: clusters.map((c, i) => ({
          id: invoices[i]?.id ?? 'N/A',
          invoice_number: invoices[i]?.invoice_number ?? 'N/A',
          pages: c,
        })),
        status: 'skipped_cluster_mismatch',
      });
      totalSkipped += invoices.length;
      continue;
    }

    const pageAssignments: Array<{ id: string; invoice_number: string; pages: number[] }> = [];
    const pdfFilename = normalizePdfFilename(firstInvoice.pdf_path || '');

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      const cluster = clusters[i];
      pageAssignments.push({ id: inv.id, invoice_number: inv.invoice_number, pages: cluster });

      if (execute) {
        try {
          const outName = buildPerInvoiceFilename(pdfFilename, inv.document_invoice_index, inv.document_invoice_total);
          const outDir = path.dirname(resolvedPdf);
          const outPath = path.join(outDir, outName);
          await extractPdfPages(resolvedPdf, cluster, outPath);

          db.prepare(`
            UPDATE invoices
            SET pdf_path = ?, pdf_page_start = ?, pdf_page_end = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            buildApiPdfPath(outName),
            Math.min(...cluster),
            Math.max(...cluster),
            inv.id
          );
          totalUpdated++;
          console.log(`[BACKFILL] Updated invoice ${inv.id} (${inv.invoice_number}) -> pages [${cluster.join(',')}]`);
        } catch (extractErr: any) {
          console.warn(`[BACKFILL] Extraction failed for ${inv.id}:`, extractErr?.message);
        }
      }
    }

    results.push({
      group_id: groupId,
      invoice_count: invoices.length,
      pdf_found: true,
      clusters_match: true,
      page_assignments: pageAssignments,
      status: execute ? 'updated' : 'would_update',
    });
  }

  return {
    mode: execute ? 'execute' : 'dry_run',
    total_groups: groups.size,
    total_invoices: rows.length,
    total_updated: totalUpdated,
    total_skipped: totalSkipped,
    groups: results,
  };
}

export async function GET() {
  try {
    const result = await runBackfill(false);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[BACKFILL] Dry-run error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runBackfill(true);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[BACKFILL] Execute error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
