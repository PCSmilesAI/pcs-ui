import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/db/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { parseInvoiceWithGPT } from '../../../../../lib/gpt/parseInvoice';
import { getPdfPageCount } from '../../../../../lib/gpt/pdfToImages';
import { normalizeVendorNameForStorage } from '../../../../../lib/invoices/vendorNormalization';
import { resolveVendor } from '../../../../../lib/invoices/vendorMatcher';
import { buildApiPdfPath, normalizePdfFilename } from '../../../../../lib/security/filename';
import { normalizeDateForStorage } from '../../../../../lib/utils/dateUtils';
import { extractPdfPages, buildPerInvoiceFilename } from '../../../../../lib/pdf/extractPages';

export const dynamic = 'force-dynamic';

// Get the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/var/www/pcs-ui';

// Multiple directories where PDFs might be stored (in order of preference)
const DATA_DIR = process.env.PCS_DATA_DIR || path.join(PROJECT_ROOT, 'pcs_ui_data');
const INBOX_DATA_DIR = process.env.INBOX_DATA_DIR || '/var/www/pcs-ui-data';
const EMAIL_INVOICES_DIRS = [
  path.join(DATA_DIR, 'email_invoices'),
  path.join(INBOX_DATA_DIR, 'email_invoices'),
  process.env.EMAIL_INVOICES_DIR || path.join(PROJECT_ROOT, 'pcs_ui_data', 'email_invoices'),
  path.join(PROJECT_ROOT, 'email_invoices'),  // Legacy/root directory
];

// Smart reparse script - ISOLATED from main parsing pipeline
const SMART_REPARSE_PATH = process.env.SMART_REPARSE_PATH || path.join(PROJECT_ROOT, 'smart_reparse.py');

interface Invoice {
  id: string;
  invoice_number: string;
  pdf_path: string | null;
  source_file: string | null;
  vendor_name: string | null;
  amount_cents: number | null;
  parsing_status: string | null;
  parse_attempts: number | null;
  invoice_date: string | null;
}

interface SmartReparseResult {
  success: boolean;
  pdf_path: string;
  extraction_method: string | null;
  focus_fields: string[];
  extracted: {
    amount?: number;
    amount_cents?: number;
    vendor?: string;
    invoice_date?: string;
    due_date?: string;
    invoice_number?: string;
    office_location?: string;
  };
  strategies_used: Record<string, string>;
  errors: string[];
  parsing_status?: string;
  invoice_id?: string;
}

/**
 * Extract PDF filename from path
 */
function getPdfFilenameFromPath(pdfPath: string | null): string | null {
  if (!pdfPath) return null;
  
  // Handle /api/pdf/filename.pdf format
  if (pdfPath.startsWith('/api/pdf/')) {
    return pdfPath.substring('/api/pdf/'.length);
  }
  
  // Handle full path
  return path.basename(pdfPath);
}

/**
 * Find PDF file on disk (handles hash suffix variations)
 * Searches multiple directories where PDFs might be stored
 */
function findPdfFile(pdfFilename: string | null): string | null {
  if (!pdfFilename) return null;
  
  // Try without hash suffix for fuzzy matching
  const baseName = pdfFilename.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
  
  // Search each directory
  for (const dir of EMAIL_INVOICES_DIRS) {
    // Check if directory exists
    if (!fs.existsSync(dir)) continue;
    
    // 1. Try exact match
    const directPath = path.join(dir, pdfFilename);
    if (fs.existsSync(directPath)) {
      console.log('[REPARSE] Found PDF at:', directPath);
      return directPath;
    }
    
    // 2. Try fuzzy match (different hash suffix)
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
          const fileBase = file.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
          if (fileBase.toLowerCase() === baseName.toLowerCase()) {
            const foundPath = path.join(dir, file);
            console.log('[REPARSE] Found PDF (fuzzy match) at:', foundPath);
            return foundPath;
          }
        }
      }
    } catch (err) {
      console.error('[REPARSE] Error reading directory:', dir, err);
    }
  }
  
  console.warn('[REPARSE] PDF not found in any directory:', pdfFilename, 'Searched:', EMAIL_INVOICES_DIRS);
  return null;
}

/**
 * Determine which fields are missing and need focused extraction
 */
function getMissingFields(invoice: Invoice): string[] {
  const missing: string[] = [];
  
  // Check amount - missing if null, 0, or undefined
  if (!invoice.amount_cents || invoice.amount_cents === 0) {
    missing.push('amount');
  }
  
  // Check vendor - missing if null, empty, or "Unknown"
  if (!invoice.vendor_name || invoice.vendor_name.trim() === '' || invoice.vendor_name === 'Unknown') {
    missing.push('vendor');
  }
  
  // Check date - missing if null or empty
  if (!invoice.invoice_date) {
    missing.push('date');
  }
  
  return missing;
}

/**
 * POST /api/invoices/[id]/reparse
 * Re-parses an invoice's PDF file.
 * 
 * For multi-page PDFs: Uses GPT pipeline with multi-invoice detection.
 * When multiple invoices are found, creates new DB records and soft-deletes the original.
 * 
 * For single-page PDFs or fallback: Uses the ISOLATED smart_reparse.py script.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    // Get the invoice with current data
    const invoice = db.prepare(`
      SELECT id, invoice_number, pdf_path, source_file, vendor_name, amount_cents, 
             parsing_status, parse_attempts, invoice_date
      FROM invoices 
      WHERE id = ? AND deleted = 0
    `).get(id) as Invoice | undefined;

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Find the PDF file
    const pdfFilename = getPdfFilenameFromPath(invoice.pdf_path);
    const pdfPath = findPdfFile(pdfFilename);

    if (!pdfPath) {
      // Update parsing status to indicate PDF not found
      db.prepare(`
        UPDATE invoices 
        SET parsing_status = 'failed',
            parsing_error = 'PDF file not found on server',
            parse_attempts = COALESCE(parse_attempts, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);

      return NextResponse.json(
        { error: 'PDF file not found on server', pdfFilename },
        { status: 404 }
      );
    }

    // Check PDF page count to decide which pipeline to use
    let pageCount = 1;
    try {
      pageCount = getPdfPageCount(pdfPath);
      console.log('[REPARSE] PDF page count:', pageCount);
    } catch {
      console.warn('[REPARSE] Could not determine page count, defaulting to 1');
    }

    // For multi-page PDFs, use GPT pipeline with multi-invoice detection
    if (pageCount > 1) {
      console.log(`[REPARSE] Multi-page PDF (${pageCount} pages) - using GPT pipeline with multi-invoice detection`);
      
      try {
        const parseResult = await parseInvoiceWithGPT(pdfPath, invoice.vendor_name);
        
        // If multiple invoices detected, create new records and soft-delete original
        if (parseResult.success && parseResult.multipleInvoices && parseResult.multipleInvoices.invoices.length > 1) {
          const multiInvoices = parseResult.multipleInvoices.invoices;
          console.log(`[REPARSE] Multi-invoice detected: ${multiInvoices.length} invoices in document`);
          
          // Filter out invoices with 0 confidence or no meaningful data (non-invoice pages)
          const validInvoices = multiInvoices.filter(inv => {
            if (inv.parsing_confidence <= 0.1) return false;
            if (!inv.invoice_number && !inv.total && (!inv.line_items || inv.line_items.length === 0)) return false;
            return true;
          });
          
          if (validInvoices.length <= 1) {
            console.log(`[REPARSE] Only ${validInvoices.length} valid invoices after filtering, treating as single invoice`);
            // Fall through to single-invoice handling below
          } else {
            console.log(`[REPARSE] ${validInvoices.length} valid invoices (filtered from ${multiInvoices.length})`);
            
            const documentGroupId = randomUUID();
            const totalInvoicesInDoc = validInvoices.length;
            const createdInvoices: Array<{ id: string; invoice_number: string; vendor: string; amount: number }> = [];
            const normalizedPdf = normalizePdfFilename(invoice.pdf_path || '');
            
            // Track used invoice numbers to handle duplicates
            const usedInvoiceNumbers = new Set<string>();
            
            // Prepare invoice data for bulk insert
            const invoicesToInsert: Array<{
              newId: string; invoiceNumber: string; normalizedVendor: string;
              amountCents: number; parsed: typeof validInvoices[0];
              parsingStatus: string; parsingError: string | null;
              invoiceIndex: number; normalizedInvoiceDate: string | null;
              normalizedDueDate: string | null;
            }> = [];
            
            for (let idx = 0; idx < validInvoices.length; idx++) {
              const parsed = validInvoices[idx];
              const invoiceIndex = idx + 1;
              
              const rawVendor = parsed.vendor_name || parseResult.vendorDetected || invoice.vendor_name || 'Unknown';
              const normalizedVendor = normalizeVendorNameForStorage(rawVendor);
              
              let invoiceNumber = parsed.invoice_number || `${invoice.invoice_number}-${invoiceIndex}`;
              const baseNumber = invoiceNumber;
              let suffix = 2;
              while (usedInvoiceNumbers.has(`${invoiceNumber}::${normalizedVendor}`)) {
                invoiceNumber = `${baseNumber}-${suffix}`;
                suffix++;
              }
              usedInvoiceNumbers.add(`${invoiceNumber}::${normalizedVendor}`);
              
              const existing = db.prepare(
                `SELECT id, invoice_number FROM invoices WHERE invoice_number = ? AND vendor_name = ? AND deleted = 0 AND id != ?`
              ).get(invoiceNumber, normalizedVendor, id) as { id: string; invoice_number: string } | undefined;
              if (existing) {
                console.warn(`[REPARSE] DUPLICATE SKIPPED: invoice_number=${invoiceNumber}, vendor=${normalizedVendor} already exists as id=${existing.id}`);
                continue;
              }
              
              let amountCents = 0;
              if (parsed.total && typeof parsed.total === 'number') {
                amountCents = Math.round(parsed.total * 100);
              }
              
              let parsingStatus = 'success';
              let parsingError: string | null = null;
              if (parsed.parsing_confidence < 0.5) {
                parsingStatus = 'partial';
                parsingError = 'Low parsing confidence';
              } else if (!parsed.invoice_number || !parsed.total) {
                parsingStatus = 'partial';
                parsingError = 'Missing required fields';
              }
              
              invoicesToInsert.push({
                newId: randomUUID(),
                invoiceNumber,
                normalizedVendor,
                amountCents,
                parsed,
                parsingStatus,
                parsingError,
                invoiceIndex,
                normalizedInvoiceDate: normalizeDateForStorage(parsed.invoice_date),
                normalizedDueDate: normalizeDateForStorage(parsed.due_date),
              });
            }
            
            // Extract per-invoice PDFs before the transaction
            const perInvoicePdfPaths = new Map<string, { apiPath: string; pageStart: number; pageEnd: number }>();
            for (const inv of invoicesToInsert) {
              if (inv.parsed.sourcePages && inv.parsed.sourcePages.length > 0) {
                try {
                  const outName = buildPerInvoiceFilename(
                    normalizedPdf,
                    inv.invoiceIndex,
                    totalInvoicesInDoc
                  );
                  const outDir = path.dirname(pdfPath);
                  const outPath = path.join(outDir, outName);
                  await extractPdfPages(pdfPath, inv.parsed.sourcePages, outPath);
                  perInvoicePdfPaths.set(inv.newId, {
                    apiPath: buildApiPdfPath(outName),
                    pageStart: Math.min(...inv.parsed.sourcePages),
                    pageEnd: Math.max(...inv.parsed.sourcePages),
                  });
                  console.log(`[REPARSE] Extracted pages [${inv.parsed.sourcePages.join(',')}] -> ${outName}`);
                } catch (extractErr: any) {
                  console.warn(`[REPARSE] PDF extraction failed for inv ${inv.invoiceIndex}, using full PDF:`, extractErr?.message);
                }
              }
            }

            // Synchronous transaction for all DB inserts (better-sqlite3 requires sync)
            const insertAllInvoices = db.transaction(() => {
              for (const inv of invoicesToInsert) {
                const perInv = perInvoicePdfPaths.get(inv.newId);
                const invPdfPath = perInv?.apiPath ?? (invoice.pdf_path || buildApiPdfPath(normalizedPdf));
                const pageStart = perInv?.pageStart ?? null;
                const pageEnd = perInv?.pageEnd ?? null;

                db.prepare(`
                  INSERT INTO invoices (
                    id, invoice_number, source_file,
                    parsed_vendor_name, parsed_office_id, parsed_amount_cents,
                    vendor_name, office_id, amount_cents,
                    status, approvals, deleted,
                    invoice_date, due_date, office_location, pdf_path,
                    parsing_status, parsing_error, parse_attempts,
                    document_group_id, document_invoice_index, document_invoice_total,
                    pdf_page_start, pdf_page_end
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  inv.newId, inv.invoiceNumber, invoice.source_file,
                  inv.normalizedVendor, inv.parsed.office_location, inv.amountCents,
                  inv.normalizedVendor, inv.parsed.office_location, inv.amountCents,
                  'incoming', JSON.stringify({}), 0,
                  inv.normalizedInvoiceDate, inv.normalizedDueDate, inv.parsed.office_location,
                  invPdfPath,
                  inv.parsingStatus, inv.parsingError, 1,
                  documentGroupId, inv.invoiceIndex, totalInvoicesInDoc,
                  pageStart, pageEnd
                );
                
                db.prepare(`
                  INSERT INTO invoice_events (invoice_id, action, payload_json)
                  VALUES (?, 'REPARSE_MULTI_SPLIT', ?)
                `).run(inv.newId, JSON.stringify({
                  original_invoice_id: id,
                  document_group_id: documentGroupId,
                  invoice_index: inv.invoiceIndex,
                  total_in_document: totalInvoicesInDoc,
                  vendor: inv.normalizedVendor,
                  amount_cents: inv.amountCents
                }));
                
                createdInvoices.push({
                  id: inv.newId,
                  invoice_number: inv.invoiceNumber,
                  vendor: inv.normalizedVendor,
                  amount: inv.amountCents / 100
                });
                
                console.log(`[REPARSE] Created invoice ${inv.invoiceIndex}/${totalInvoicesInDoc}:`, {
                  id: inv.newId, invoice_number: inv.invoiceNumber, vendor: inv.normalizedVendor, amount: inv.amountCents / 100
                });
              }
              
              // Soft-delete the original invoice
              db.prepare(`UPDATE invoices SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
            });
            
            insertAllInvoices();
            
            // Async categorization AFTER the transaction (non-critical, won't roll back inserts)
            for (const inv of invoicesToInsert) {
              try {
                const { categorizeInvoice, storeInvoiceCategories } = await import('@/lib/invoices/categoryParser');
                const lineItems = (inv.parsed.line_items || []).map(item => ({
                  description: item.description || '',
                  quantity: item.quantity ?? undefined,
                  unit_price: item.unit_price ?? undefined,
                  amount: item.amount ?? undefined
                }));
                const categories = await categorizeInvoice(
                  { vendor_name: inv.normalizedVendor, line_items: lineItems },
                  inv.normalizedVendor
                );
                await storeInvoiceCategories(inv.newId, categories);
              } catch (err: any) {
                console.warn('[REPARSE] Failed to auto-categorize:', err?.message);
              }
            }
            
            console.log(`[REPARSE] Soft-deleted original invoice ${id}, replaced with ${createdInvoices.length} individual invoices`);
            
            return NextResponse.json({
              ok: true,
              message: `Multi-invoice document: created ${createdInvoices.length} invoices (original deleted)`,
              multi_invoice: true,
              document_group_id: documentGroupId,
              invoices_created: createdInvoices.length,
              invoices: createdInvoices,
              original_invoice_deleted: id
            });
          }
        }
        
        // Single invoice from GPT - update the existing record
        if (parseResult.success && parseResult.data) {
          const parsed = parseResult.data;
          const rawVendor = parsed.vendor_name || parseResult.vendorDetected || invoice.vendor_name || 'Unknown';
          const normalizedVendor = normalizeVendorNameForStorage(rawVendor);
          const amountCents = parsed.total ? Math.round(parsed.total * 100) : 0;
          const normalizedInvoiceDate = normalizeDateForStorage(parsed.invoice_date);
          const normalizedDueDate = normalizeDateForStorage(parsed.due_date);
          
          let parsingStatus = 'success';
          let parsingError: string | null = null;
          if (parsed.parsing_confidence < 0.5) {
            parsingStatus = 'partial';
            parsingError = 'Low parsing confidence';
          } else if (!parsed.invoice_number || !parsed.total) {
            parsingStatus = 'partial';
            parsingError = 'Missing required fields';
          }
          
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
              invoice_date = ?,
              due_date = ?,
              invoice_number = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE invoice_number END,
              parsing_status = ?,
              parsing_error = ?,
              parse_attempts = COALESCE(parse_attempts, 0) + 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            normalizedVendor, normalizedVendor,
            parsed.office_location, parsed.office_location,
            amountCents, amountCents,
            parsed.total, parsed.total,
            normalizedInvoiceDate, normalizedDueDate,
            parsed.invoice_number, parsed.invoice_number, parsed.invoice_number,
            parsingStatus, parsingError,
            id
          );
          
          db.prepare(`
            INSERT INTO invoice_events (invoice_id, action, payload_json)
            VALUES (?, 'GPT_REPARSE', ?)
          `).run(id, JSON.stringify({
            vendor: normalizedVendor,
            amount_cents: amountCents,
            parsing_status: parsingStatus,
            confidence: parsed.parsing_confidence,
            pages: pageCount
          }));
          
          return NextResponse.json({
            ok: true,
            message: parsingStatus === 'success' 
              ? 'Invoice re-parsed successfully' 
              : 'Invoice re-parsed but some data could not be extracted',
            invoice_number: parsed.invoice_number || invoice.invoice_number,
            amount: amountCents > 0 ? (amountCents / 100).toFixed(2) : null,
            vendor: normalizedVendor || null,
            parsing_status: parsingStatus,
            parsing_error: parsingError
          });
        }
        
        // GPT parse failed - fall through to smart_reparse
        console.warn('[REPARSE] GPT pipeline failed, falling back to smart_reparse');
      } catch (gptErr: any) {
        console.error('[REPARSE] GPT pipeline error, falling back to smart_reparse:', gptErr.message);
      }
    }

    // Single-page PDF or GPT fallback: use smart_reparse.py
    const missingFields = getMissingFields(invoice);
    const focusArg = missingFields.length > 0 ? `--focus=${missingFields.join(',')}` : '';
    const forceOcr = (invoice.parse_attempts || 0) >= 1;
    const ocrArg = forceOcr ? '--force-ocr' : '';

    console.log('[REPARSE] Running smart_reparse on:', pdfPath);
    console.log('[REPARSE] Missing fields:', missingFields);
    console.log('[REPARSE] Force OCR:', forceOcr);

    let reparseResult: SmartReparseResult | null = null;
    let parseError = '';
    
    try {
      const command = `python3 "${SMART_REPARSE_PATH}" "${pdfPath}" ${focusArg} ${ocrArg} --invoice-id="${id}"`;
      console.log('[REPARSE] Command:', command);
      
      const output = execSync(command, { 
        cwd: path.dirname(SMART_REPARSE_PATH),
        timeout: 120000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      try {
        reparseResult = JSON.parse(output) as SmartReparseResult;
      } catch (jsonErr) {
        console.error('[REPARSE] Failed to parse JSON output:', output);
        parseError = 'Failed to parse reparse output';
      }
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; message?: string };
      if (execError.stdout) {
        try {
          reparseResult = JSON.parse(execError.stdout) as SmartReparseResult;
        } catch {
          parseError = execError.message || 'Smart reparse script failed';
        }
      } else {
        parseError = execError.message || 'Smart reparse script failed';
      }
      if (execError.stderr) {
        console.error('[REPARSE] Script stderr:', execError.stderr);
      }
    }

    if (!reparseResult) {
      db.prepare(`
        UPDATE invoices 
        SET parsing_status = 'failed',
            parsing_error = ?,
            parse_attempts = COALESCE(parse_attempts, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(parseError.substring(0, 500), id);

      return NextResponse.json(
        { error: 'Smart reparse failed', details: parseError.substring(0, 200) },
        { status: 500 }
      );
    }

    const extracted = reparseResult.extracted || {};
    const vendor = extracted.vendor || '';
    const amountCents = extracted.amount_cents || 0;
    const officeLocation = extracted.office_location || '';
    const invoiceDate = extracted.invoice_date || '';
    const dueDate = extracted.due_date || '';

    const hasAmount = extracted.amount_cents !== undefined && extracted.amount_cents !== null;
    const hasVendor = vendor && vendor !== 'Unknown' && vendor.trim() !== '';
    
    let parsingStatus = 'success';
    let parsingError: string | null = null;
    
    if (!hasAmount && !hasVendor) {
      parsingStatus = 'failed';
      parsingError = reparseResult.errors?.join('; ') || 'No data extracted from invoice';
    } else if (!hasAmount) {
      parsingStatus = 'partial';
      parsingError = 'Invoice total not extracted';
    } else if (!hasVendor) {
      parsingStatus = 'partial';
      parsingError = 'Vendor name not extracted';
    }

    db.prepare(`
      UPDATE invoices 
      SET 
        vendor_name = CASE WHEN ? != '' AND ? != 'Unknown' THEN ? ELSE vendor_name END,
        parsed_vendor_name = CASE WHEN ? != '' AND ? != 'Unknown' THEN ? ELSE parsed_vendor_name END,
        amount_cents = CASE WHEN ? > 0 THEN ? ELSE amount_cents END,
        parsed_amount_cents = CASE WHEN ? > 0 THEN ? ELSE parsed_amount_cents END,
        office_location = CASE WHEN ? != '' THEN ? ELSE office_location END,
        office_id = CASE WHEN ? != '' THEN ? ELSE office_id END,
        invoice_date = CASE WHEN ? != '' THEN ? ELSE invoice_date END,
        due_date = CASE WHEN ? != '' THEN ? ELSE due_date END,
        total = CASE WHEN ? > 0 THEN CAST(? AS REAL) / 100.0 ELSE total END,
        invoice_total = CASE WHEN ? > 0 THEN CAST(? AS REAL) / 100.0 ELSE invoice_total END,
        parsing_status = ?,
        parsing_error = ?,
        parse_attempts = COALESCE(parse_attempts, 0) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      vendor, vendor, vendor,
      vendor, vendor, vendor,
      amountCents, amountCents,
      amountCents, amountCents,
      officeLocation, officeLocation,
      officeLocation, officeLocation,
      invoiceDate, invoiceDate,
      dueDate, dueDate,
      amountCents, amountCents,
      amountCents, amountCents,
      parsingStatus,
      parsingError,
      id
    );

    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, payload_json)
      VALUES (?, 'SMART_REPARSE', ?)
    `).run(id, JSON.stringify({
      old_amount_cents: invoice.amount_cents,
      new_amount_cents: amountCents,
      old_vendor: invoice.vendor_name,
      new_vendor: vendor,
      parsing_status: parsingStatus,
      parse_attempts: (invoice.parse_attempts || 0) + 1,
      extraction_method: reparseResult.extraction_method,
      strategies_used: reparseResult.strategies_used,
      focus_fields: missingFields,
      force_ocr: forceOcr
    }));

    console.log('[REPARSE] Success:', {
      invoiceId: id,
      invoiceNumber: invoice.invoice_number,
      amountCents,
      vendor,
      parsingStatus,
      strategies: reparseResult.strategies_used
    });

    return NextResponse.json({
      ok: true,
      message: parsingStatus === 'success' 
        ? 'Invoice re-parsed successfully' 
        : 'Invoice re-parsed but some data could not be extracted',
      invoice_number: invoice.invoice_number,
      amount: amountCents > 0 ? (amountCents / 100).toFixed(2) : null,
      vendor: vendor || null,
      parsing_status: parsingStatus,
      parsing_error: parsingError,
      extraction_method: reparseResult.extraction_method,
      strategies_used: reparseResult.strategies_used
    });

  } catch (err: unknown) {
    console.error('[REPARSE] Error:', err);
    return NextResponse.json(
      { error: 'Failed to re-parse invoice' },
      { status: 500 }
    );
  }
}
