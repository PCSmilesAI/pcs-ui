/**
 * Scan and Reparse API
 * 
 * POST /api/invoices/scan-and-reparse
 * 
 * After a user updates an invoice and the knowledge base is updated,
 * this endpoint scans other invoices to find similar ones and re-parses them
 * using the updated knowledge base.
 * 
 * Flow:
 * 1. Filter all invoices by vendor name (case-insensitive)
 * 2. For each invoice, use GPT to compare visual similarity with the updated invoice
 * 3. For similar invoices, re-parse using the updated knowledge base
 * 4. Update database and remove from failed tracking if successful
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';
import { getDatabase } from '@/lib/db/client';
import { parseInvoiceWithGPT, comparePdfSimilarity } from '@/lib/gpt/parseInvoice';
import { removeFromFailedTracking } from '@/lib/gpt/bulkParse';
import * as path from 'path';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

// Minimum confidence threshold for similarity matching
const SIMILARITY_THRESHOLD = 0.7;

interface ScanResult {
  success: boolean;
  scanned: number;
  matched: number;
  reparsed: number;
  fixed: number;  // Number removed from failed tracking
  errors: string[];
  details: Array<{
    invoiceId: string;
    invoiceNumber: string;
    action: 'skipped' | 'not_similar' | 'reparsed' | 'error';
    reason?: string;
  }>;
}

/**
 * Resolve PDF path to absolute path
 */
function resolvePdfPath(pdfPath: string | null): string | null {
  if (!pdfPath) return null;

  // If already absolute, check if exists
  if (path.isAbsolute(pdfPath)) {
    return fs.existsSync(pdfPath) ? pdfPath : null;
  }

  // Try various locations
  const possiblePaths = [
    path.join(process.cwd(), pdfPath),
    path.join(process.cwd(), 'email_invoices', path.basename(pdfPath)),
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', path.basename(pdfPath)),
    path.join(process.cwd(), 'public', 'email_invoices', path.basename(pdfPath)),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * POST /api/invoices/scan-and-reparse
 * 
 * Body:
 * {
 *   "vendorName": "Patterson Dental",
 *   "updatedPdfPath": "/path/to/updated/invoice.pdf",
 *   "updatedInvoiceId": "abc123"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Check access - admin or AP users
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    const { vendorName, updatedPdfPath, updatedInvoiceId } = body;

    if (!vendorName) {
      return NextResponse.json(
        { error: 'vendorName is required' },
        { status: 400 }
      );
    }

    console.log('[SCAN-REPARSE] Starting scan for vendor:', vendorName);

    // Resolve the updated invoice PDF path
    const referencePdfPath = resolvePdfPath(updatedPdfPath);
    if (!referencePdfPath) {
      console.warn('[SCAN-REPARSE] Could not resolve reference PDF, will match by vendor only');
    }

    const db = getDatabase();
    const result: ScanResult = {
      success: true,
      scanned: 0,
      matched: 0,
      reparsed: 0,
      fixed: 0,
      errors: [],
      details: [],
    };

    // Get all invoices with matching vendor name (case-insensitive)
    // Also get invoices where vendor is "Unknown" that might match
    const candidateInvoices = db.prepare(`
      SELECT id, invoice_number, vendor_name, pdf_path, source_file, parsing_error
      FROM invoices
      WHERE (
        LOWER(vendor_name) = LOWER(?)
        OR LOWER(parsed_vendor_name) = LOWER(?)
        OR vendor_name = 'Unknown'
        OR vendor_name IS NULL
      )
      AND id != ?
      AND deleted = 0
    `).all(vendorName, vendorName, updatedInvoiceId || '') as Array<{
      id: string;
      invoice_number: string;
      vendor_name: string | null;
      pdf_path: string | null;
      source_file: string | null;
      parsing_error: string | null;
    }>;

    console.log(`[SCAN-REPARSE] Found ${candidateInvoices.length} candidate invoices`);
    result.scanned = candidateInvoices.length;

    const fixedFiles: string[] = [];

    // Process each candidate
    for (const invoice of candidateInvoices) {
      const invoicePdfPath = resolvePdfPath(invoice.pdf_path || invoice.source_file);
      
      // Skip if PDF not found
      if (!invoicePdfPath) {
        result.details.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          action: 'skipped',
          reason: 'PDF file not found'
        });
        continue;
      }

      // If we have a reference PDF, check visual similarity
      if (referencePdfPath) {
        try {
          console.log(`[SCAN-REPARSE] Comparing ${path.basename(invoicePdfPath)} to reference`);
          const similarity = await comparePdfSimilarity(referencePdfPath, invoicePdfPath);
          
          if (!similarity.similar || similarity.confidence < SIMILARITY_THRESHOLD) {
            result.details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              action: 'not_similar',
              reason: `Similarity: ${similarity.confidence.toFixed(2)} - ${similarity.reason}`
            });
            continue;
          }

          console.log(`[SCAN-REPARSE] Match found: ${invoice.invoice_number} (confidence: ${similarity.confidence})`);
          result.matched++;
        } catch (simError: any) {
          console.warn(`[SCAN-REPARSE] Similarity check failed for ${invoice.invoice_number}:`, simError.message);
          // If vendor matches exactly, continue with reparse anyway
          if (invoice.vendor_name?.toLowerCase() !== vendorName.toLowerCase()) {
            result.details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              action: 'skipped',
              reason: `Similarity check failed: ${simError.message}`
            });
            continue;
          }
          result.matched++;
        }
      } else {
        // No reference PDF, match by vendor name only
        if (invoice.vendor_name?.toLowerCase() === vendorName.toLowerCase()) {
          result.matched++;
        } else {
          result.details.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            action: 'skipped',
            reason: 'Vendor name does not match exactly'
          });
          continue;
        }
      }

      // Re-parse the invoice with updated knowledge base
      try {
        console.log(`[SCAN-REPARSE] Re-parsing ${invoice.invoice_number}`);
        const parseResult = await parseInvoiceWithGPT(invoicePdfPath);

        if (parseResult.success && parseResult.data) {
          const totalCents = parseResult.data.total ? Math.round(parseResult.data.total * 100) : null;

          // Update database
          db.prepare(`
            UPDATE invoices SET
              parsed_vendor_name = ?,
              vendor_name = COALESCE(corrected_vendor_name, ?),
              parsed_office_id = ?,
              office_location = COALESCE(corrected_office_id, ?),
              parsed_amount_cents = ?,
              amount_cents = COALESCE(corrected_amount_cents, ?),
              total = ?,
              invoice_total = ?,
              invoice_date = COALESCE(invoice_date, ?),
              due_date = COALESCE(due_date, ?),
              parsing_method = ?,
              parsing_confidence = ?,
              parsing_error = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            parseResult.data.vendor_name,
            parseResult.data.vendor_name,
            parseResult.data.office_location,
            parseResult.data.office_location,
            totalCents,
            totalCents,
            parseResult.data.total,
            parseResult.data.total,
            parseResult.data.invoice_date,
            parseResult.data.due_date,
            'gpt-5-nano',
            parseResult.data.parsing_confidence,
            invoice.id
          );

          result.reparsed++;
          result.details.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            action: 'reparsed',
            reason: `Successfully reparsed with confidence ${parseResult.data.parsing_confidence}`
          });

          // Track if this was previously a failed invoice
          if (invoice.parsing_error) {
            fixedFiles.push(path.basename(invoice.pdf_path || invoice.source_file || ''));
          }
        } else {
          result.details.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            action: 'error',
            reason: parseResult.error || 'Failed to parse'
          });
          result.errors.push(`${invoice.invoice_number}: ${parseResult.error}`);
        }
      } catch (parseError: any) {
        console.error(`[SCAN-REPARSE] Error reparsing ${invoice.invoice_number}:`, parseError.message);
        result.details.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          action: 'error',
          reason: parseError.message
        });
        result.errors.push(`${invoice.invoice_number}: ${parseError.message}`);
      }

      // Small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Remove fixed files from failed tracking
    if (fixedFiles.length > 0) {
      result.fixed = removeFromFailedTracking(fixedFiles);
      console.log(`[SCAN-REPARSE] Removed ${result.fixed} invoices from failed tracking`);
    }

    console.log(`[SCAN-REPARSE] Complete: scanned=${result.scanned}, matched=${result.matched}, reparsed=${result.reparsed}, fixed=${result.fixed}`);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[SCAN-REPARSE] Error:', error.message);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to scan and reparse', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invoices/scan-and-reparse
 * 
 * Health check / status endpoint
 */
export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDatabase();
    
    // Get counts of invoices by vendor
    const vendorCounts = db.prepare(`
      SELECT 
        vendor_name,
        COUNT(*) as total,
        SUM(CASE WHEN parsing_error IS NOT NULL THEN 1 ELSE 0 END) as failed
      FROM invoices
      WHERE deleted = 0
      GROUP BY vendor_name
      ORDER BY total DESC
      LIMIT 20
    `).all();

    return NextResponse.json({
      success: true,
      service: 'scan-and-reparse',
      status: 'ready',
      topVendors: vendorCounts,
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
