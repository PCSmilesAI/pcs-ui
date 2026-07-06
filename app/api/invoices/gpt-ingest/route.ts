import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { isTombstoned } from '../../../../lib/invoices/tombstoneService';
import { normalizeVendorNameForStorage, inferVendorFromHints } from '../../../../lib/invoices/vendorNormalization';
import { resolveVendor } from '../../../../lib/invoices/vendorMatcher';
import { buildApiPdfPath, normalizePdfFilename } from '../../../../lib/security/filename';
import { isPathWithinBase } from '../../../../lib/security/path-validation';
import { normalizeDateForStorage } from '../../../../lib/utils/dateUtils';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// Import PCS AI parsing
import { parseInvoiceWithGPT, ParseResult, ParsedInvoice } from '../../../../lib/gpt/parseInvoice';
import { extractPdfPages, buildPerInvoiceFilename } from '../../../../lib/pdf/extractPages';
import { QBOClient } from '../../../../lib/qbo/qboClient';

// Cache for QBO vendors (5 minute TTL)
let qboVendorsCache: { vendors: string[]; timestamp: number } | null = null;
const QBO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get QBO vendor list (cached)
 */
async function getQBOVendors(): Promise<string[]> {
  // Check cache
  if (qboVendorsCache && Date.now() - qboVendorsCache.timestamp < QBO_CACHE_TTL) {
    return qboVendorsCache.vendors;
  }

  try {
    const qboClient = new QBOClient();
    await qboClient.initialize();
    const vendors = await qboClient.getAllVendors();
    const vendorNames = vendors.map(v => v.displayName);
    
    // Update cache
    qboVendorsCache = { vendors: vendorNames, timestamp: Date.now() };
    console.log(`[PCS_AI_INGEST] Loaded ${vendorNames.length} QBO vendors for validation`);
    return vendorNames;
  } catch (error: any) {
    console.warn('[PCS_AI_INGEST] Could not fetch QBO vendors:', error.message);
    return qboVendorsCache?.vendors || [];
  }
}

export const dynamic = 'force-dynamic';

interface GPTIngestPayload {
  pdf_path: string;
  source_file?: string;
  vendor_hint?: string;
  force_reparse?: boolean;
}

function findExistingInvoiceByNumber(
  db: ReturnType<typeof getDatabase>,
  invoiceNumber: string,
  normalizedVendor: string
): { id: string; invoice_number: string; vendor_name?: string } | undefined {
  const exact = db.prepare(
    `SELECT id, invoice_number, vendor_name FROM invoices WHERE invoice_number = ? AND vendor_name = ? AND deleted = 0`
  ).get(invoiceNumber, normalizedVendor) as { id: string; invoice_number: string; vendor_name?: string } | undefined;
  if (exact) return exact;

  // Prevent hidden Unknown duplicates when the same invoice number already exists under any vendor
  return db.prepare(
    `SELECT id, invoice_number, vendor_name FROM invoices WHERE invoice_number = ? AND deleted = 0 LIMIT 1`
  ).get(invoiceNumber) as { id: string; invoice_number: string; vendor_name?: string } | undefined;
}

/**
 * Resolve PDF path to absolute filesystem path
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;

  // Extract filename from any path format
  let filename = pdfPath;

  if (pdfPath.includes('/')) {
    const parts = pdfPath.split('/');
    filename = parts[parts.length - 1] || '';
  }

  if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  // Try multiple possible locations
  // The inbox watcher uses INBOX_DATA_DIR which may differ from the app's PCS_DATA_DIR
  const dataDir = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
  const inboxDataDir = process.env.INBOX_DATA_DIR || '/var/www/pcs-ui-data';
  const possiblePaths = [
    path.join(dataDir, 'email_invoices', filename),
    path.join(inboxDataDir, 'email_invoices', filename),
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'pdfs', filename),
    path.join(process.cwd(), 'sample_invoices_pcs', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      // Allow paths within cwd, data dir, or inbox data dir
      if (isPathWithinBase(p, process.cwd()) || isPathWithinBase(p, dataDir) || isPathWithinBase(p, inboxDataDir)) {
        return p;
      }
    }
  }

  // Check subdirectories of sample_invoices_pcs
  const sampleDir = path.join(process.cwd(), 'sample_invoices_pcs');
  if (fs.existsSync(sampleDir)) {
    const subdirs = fs.readdirSync(sampleDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const subdir of subdirs) {
      const subPath = path.join(sampleDir, subdir, filename);
      if (fs.existsSync(subPath) && isPathWithinBase(subPath, process.cwd())) {
        return subPath;
      }
    }
  }

  return null;
}

/**
 * POST /api/invoices/gpt-ingest
 * 
 * Ingest an invoice PDF using PCS AI for parsing.
 * This endpoint:
 * 1. Receives a PDF path
 * 2. Calls PCS AI to parse the invoice
 * 3. Stores the parsed data in the database
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as GPTIngestPayload;
    
    if (!body.pdf_path) {
      return NextResponse.json(
        { error: 'pdf_path is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const sourceFile = body.source_file || body.pdf_path;
    const normalizedPdfFilename = normalizePdfFilename(body.pdf_path);

    // Check if invoice has been tombstoned
    if (isTombstoned(sourceFile)) {
      console.log('[PCS_AI_INGEST] Invoice tombstoned:', sourceFile);
      return NextResponse.json(
        { ok: true, message: 'Invoice was previously rejected', skipped: true },
        { status: 200 }
      );
    }

    // Check if invoice already exists (unless force_reparse)
    if (!body.force_reparse) {
      let existing: { id: string } | undefined = undefined;
      
      if (sourceFile) {
        existing = db.prepare(
          'SELECT id FROM invoices WHERE source_file = ? OR pdf_path LIKE ?'
        ).get(sourceFile, `%${normalizedPdfFilename}`) as { id: string } | undefined;
      }

      if (existing) {
        return NextResponse.json(
          { ok: true, message: 'Invoice already exists', id: existing.id },
          { status: 200 }
        );
      }
    }

    // Resolve PDF path
    const resolvedPdfPath = resolvePdfPath(body.pdf_path);
    if (!resolvedPdfPath) {
      return NextResponse.json(
        { error: 'PDF file not found', pdf_path: body.pdf_path },
        { status: 404 }
      );
    }

    console.log('[PCS_AI_INGEST] Parsing invoice with PCS AI:', resolvedPdfPath);

    // Parse with PCS AI
    const parseResult: ParseResult = await parseInvoiceWithGPT(
      resolvedPdfPath,
      body.vendor_hint
    );

    if (!parseResult.success || !parseResult.data) {
      console.error('[PCS_AI_INGEST] PCS AI parsing failed:', parseResult.error);
      
      // Still create the invoice record with failed status
      const id = randomUUID();
      const invoiceNumber = `FAILED-${Date.now()}`;
      
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, source_file, pdf_path,
          parsed_vendor_name, vendor_name,
          status, approvals, deleted,
          parsing_status, parsing_error, parse_attempts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, invoiceNumber, sourceFile, buildApiPdfPath(normalizedPdfFilename),
        'Unknown', 'Unknown',
        'incoming', JSON.stringify({}), 0,
        'failed', parseResult.error || 'PCS AI parsing failed', 1
      );

      return NextResponse.json({
        ok: true,
        message: 'Invoice created with failed parsing status',
        id,
        parsing_status: 'failed',
        error: parseResult.error
      });
    }

    // Check if document contains multiple invoices
    if (parseResult.multipleInvoices && parseResult.multipleInvoices.invoices.length > 1) {
      console.log(`[PCS_AI_INGEST] Multi-invoice document detected: ${parseResult.multipleInvoices.invoices.length} invoices`);
      
      // Generate a group ID to link all invoices from this document
      const documentGroupId = randomUUID();
      const allParsedInvoices = parseResult.multipleInvoices.invoices;
      
      // Filter out non-invoice pages (low confidence, no meaningful data)
      const validInvoices = allParsedInvoices.filter(inv => {
        if (inv.parsing_confidence <= 0.1) return false;
        if (!inv.invoice_number && !inv.total && (!inv.line_items || inv.line_items.length === 0)) return false;
        return true;
      });
      
      if (validInvoices.length <= 1 && validInvoices.length < allParsedInvoices.length) {
        console.log(`[PCS_AI_INGEST] Only ${validInvoices.length} valid invoices after filtering ${allParsedInvoices.length}, treating as single invoice`);
        // Fall through to single-invoice handling below
      } else {
        const totalInvoicesInDoc = validInvoices.length;
        const createdInvoices: Array<{ id: string; invoice_number: string; vendor: string; amount: number }> = [];
        const usedInvoiceNumbers = new Set<string>();
        
        // Prepare invoice data for all valid invoices
        const invoicesToInsert: Array<{
          id: string; invoiceNumber: string; normalizedVendor: string;
          amountCents: number; parsed: typeof validInvoices[0];
          parsingStatus: string; parsingError: string | null;
          invoiceIndex: number; normalizedInvoiceDate: string | null;
          normalizedDueDate: string | null; rawVendor: string;
        }> = [];
        
        for (let idx = 0; idx < validInvoices.length; idx++) {
          const parsed = validInvoices[idx];
          const invoiceIndex = idx + 1;
          
          const rawVendor = inferVendorFromHints(
            parsed.vendor_name || parseResult.vendorDetected || 'Unknown',
            { vendorHint: body.vendor_hint, pdfFilename: normalizedPdfFilename }
          );
          let validatedVendor = rawVendor;
          
          try {
            const qboVendors = await getQBOVendors();
            if (qboVendors.length > 0) {
              const vendorMatch = resolveVendor(rawVendor, null, qboVendors);
              validatedVendor = vendorMatch.vendor;
            }
          } catch (e) {
            // Use raw vendor on error
          }
          
          const normalizedVendor = normalizeVendorNameForStorage(validatedVendor);
          
          // Validate parsed invoice number
          let validatedInvoiceNumber = parsed.invoice_number;
          if (validatedInvoiceNumber) {
            if (/[_]/.test(validatedInvoiceNumber) || validatedInvoiceNumber.length > 20 || /\.(pdf|PDF)/.test(validatedInvoiceNumber)) {
              console.warn(`[PCS_AI_INGEST] Rejected invalid invoice number (looks like filename): ${validatedInvoiceNumber}`);
              validatedInvoiceNumber = null;
            }
          }
          let invoiceNumber = validatedInvoiceNumber || 
            normalizedPdfFilename?.replace(/\.(pdf|PDF)$/, '') ||
            `GPT-${Date.now()}-${invoiceIndex}`;
          
          // Deduplicate: ensure unique invoice_number + vendor within this batch
          const baseNumber = invoiceNumber;
          let suffix = 2;
          while (usedInvoiceNumbers.has(`${invoiceNumber}::${normalizedVendor}`)) {
            invoiceNumber = `${baseNumber}-${suffix}`;
            suffix++;
          }
          usedInvoiceNumbers.add(`${invoiceNumber}::${normalizedVendor}`);
          
          // Check existing DB records -- SKIP true duplicates instead of suffixing
          const existing = findExistingInvoiceByNumber(db, invoiceNumber, normalizedVendor);
          if (existing) {
            console.warn(`[PCS_AI_INGEST] DUPLICATE SKIPPED: invoice_number=${invoiceNumber}, vendor=${normalizedVendor} already exists as id=${existing.id} (stored vendor=${existing.vendor_name})`);
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
          
          // Normalize office location
          if (parsed.office_location) {
            const loc = parsed.office_location;
            const pcsMatch = loc.match(/Pacific Crest Smiles\s*[-–]\s*(.+)/i);
            if (pcsMatch) {
              parsed.office_location = pcsMatch[1].trim();
            }
            if (/^Pacific Crest Smiles$/i.test(parsed.office_location)) {
              parsed.office_location = null;
            }
            if (/^Smiles Dental$/i.test(parsed.office_location || '')) {
              parsed.office_location = null;
            }
          }
          
          invoicesToInsert.push({
            id: randomUUID(),
            invoiceNumber,
            normalizedVendor,
            amountCents,
            parsed,
            parsingStatus,
            parsingError,
            invoiceIndex,
            normalizedInvoiceDate: normalizeDateForStorage(parsed.invoice_date),
            normalizedDueDate: normalizeDateForStorage(parsed.due_date),
            rawVendor,
          });
        }
        
        // Extract per-invoice PDFs before the transaction
        const perInvoicePdfPaths = new Map<string, { apiPath: string; pageStart: number; pageEnd: number }>();
        for (const inv of invoicesToInsert) {
          if (inv.parsed.sourcePages && inv.parsed.sourcePages.length > 0) {
            try {
              const outName = buildPerInvoiceFilename(
                normalizedPdfFilename,
                inv.invoiceIndex,
                totalInvoicesInDoc
              );
              const outDir = path.dirname(resolvedPdfPath);
              const outPath = path.join(outDir, outName);
              await extractPdfPages(resolvedPdfPath, inv.parsed.sourcePages, outPath);
              perInvoicePdfPaths.set(inv.id, {
                apiPath: buildApiPdfPath(outName),
                pageStart: Math.min(...inv.parsed.sourcePages),
                pageEnd: Math.max(...inv.parsed.sourcePages),
              });
              console.log(`[PCS_AI_INGEST] Extracted pages [${inv.parsed.sourcePages.join(',')}] -> ${outName}`);
            } catch (extractErr: any) {
              console.warn(`[PCS_AI_INGEST] PDF extraction failed for inv ${inv.invoiceIndex}, using full PDF:`, extractErr?.message);
            }
          }
        }

        // Synchronous transaction for all DB inserts
        const insertAllInvoices = db.transaction(() => {
          for (const inv of invoicesToInsert) {
            const perInv = perInvoicePdfPaths.get(inv.id);
            const pdfPath = perInv?.apiPath ?? buildApiPdfPath(normalizedPdfFilename);
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
              inv.id, inv.invoiceNumber, sourceFile,
              inv.normalizedVendor, inv.parsed.office_location, inv.amountCents,
              inv.normalizedVendor, inv.parsed.office_location, inv.amountCents,
              'incoming', JSON.stringify({}), 0,
              inv.normalizedInvoiceDate, inv.normalizedDueDate, inv.parsed.office_location,
              pdfPath,
              inv.parsingStatus, inv.parsingError, 1,
              documentGroupId, inv.invoiceIndex, totalInvoicesInDoc,
              pageStart, pageEnd
            );
            
            db.prepare(`
              INSERT INTO invoice_events (invoice_id, action, payload_json)
              VALUES (?, 'PCS_AI_PARSED_MULTI', ?)
            `).run(inv.id, JSON.stringify({
              document_group_id: documentGroupId,
              invoice_index: inv.invoiceIndex,
              total_in_document: totalInvoicesInDoc,
              vendor_raw: inv.rawVendor,
              amount_cents: inv.amountCents,
              confidence: inv.parsed.parsing_confidence
            }));
            
            createdInvoices.push({
              id: inv.id,
              invoice_number: inv.invoiceNumber,
              vendor: inv.normalizedVendor,
              amount: inv.amountCents / 100
            });
            
            console.log(`[PCS_AI_INGEST] Created invoice ${inv.invoiceIndex}/${totalInvoicesInDoc}:`, {
              id: inv.id, invoice_number: inv.invoiceNumber, vendor: inv.normalizedVendor, amount: inv.amountCents / 100
            });
          }
        });
        
        insertAllInvoices();
        
        // Async categorization after the transaction
        for (const inv of invoicesToInsert) {
          try {
            const { categorizeInvoice, storeInvoiceCategories, mapLocationToClass } = await import('@/lib/invoices/categoryParser');
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
            const officeLocation = inv.parsed.office_location || '';
            const classFromLocation = mapLocationToClass(officeLocation);
            if (classFromLocation) {
              for (const cat of categories) {
                if (!cat.className) {
                  cat.className = classFromLocation;
                  cat.classId = classFromLocation;
                }
              }
            }
            await storeInvoiceCategories(inv.id, categories);
          } catch (err: any) {
            console.warn('[PCS_AI_INGEST] Failed to auto-categorize:', err?.message);
          }
        }
        
        return NextResponse.json({
          ok: true,
          message: `Multi-invoice document: created ${createdInvoices.length} invoices`,
          multi_invoice: true,
          document_group_id: documentGroupId,
          invoices_created: createdInvoices.length,
          invoices: createdInvoices
        });
      }
    }

    // Single invoice - extract data
    const parsed = parseResult.data;
    const rawVendor = inferVendorFromHints(
      parsed.vendor_name || parseResult.vendorDetected || 'Unknown',
      { vendorHint: body.vendor_hint, pdfFilename: normalizedPdfFilename }
    );
    
    // Validate vendor against QBO list
    let validatedVendor = rawVendor;
    let vendorMatchMethod = 'raw';
    let vendorConfidence = 0;
    
    try {
      const qboVendors = await getQBOVendors();
      if (qboVendors.length > 0) {
        // Resolve vendor using the matcher
        // Note: OCR text fallback not available in current implementation
        const vendorMatch = resolveVendor(rawVendor, null, qboVendors);
        validatedVendor = vendorMatch.vendor;
        vendorMatchMethod = vendorMatch.method;
        vendorConfidence = vendorMatch.confidence;
        
        console.log('[PCS_AI_INGEST] Vendor validation:', {
          raw: rawVendor,
          validated: validatedVendor,
          method: vendorMatchMethod,
          confidence: vendorConfidence.toFixed(2)
        });
      } else {
        console.warn('[PCS_AI_INGEST] No QBO vendors available, using raw vendor name');
      }
    } catch (vendorError: any) {
      console.warn('[PCS_AI_INGEST] Vendor validation failed, using raw:', vendorError.message);
    }
    
    // Normalize for storage (handles title case, etc.)
    const normalizedVendor = normalizeVendorNameForStorage(validatedVendor);
    
    // Generate invoice number
    const invoiceNumber = parsed.invoice_number || 
      normalizedPdfFilename?.replace(/\.(pdf|PDF)$/, '') ||
      `GPT-${Date.now()}`;

    // Block true duplicates: same invoice_number already in DB (any vendor)
    if (parsed.invoice_number) {
      const existingByNumber = findExistingInvoiceByNumber(db, invoiceNumber, normalizedVendor);
      if (existingByNumber) {
        console.warn(`[PCS_AI_INGEST] DUPLICATE BLOCKED: invoice_number=${invoiceNumber}, vendor=${normalizedVendor} already exists as id=${existingByNumber.id} (stored vendor=${existingByNumber.vendor_name})`);
        return NextResponse.json(
          { ok: true, message: `Duplicate invoice: ${invoiceNumber} already exists`, duplicate: true, existing_id: existingByNumber.id },
          { status: 200 }
        );
      }
    }

    // Calculate amount in cents
    let amountCents = 0;
    if (parsed.total && typeof parsed.total === 'number') {
      amountCents = Math.round(parsed.total * 100);
    }

    // Determine parsing status based on confidence
    let parsingStatus = 'success';
    let parsingError: string | null = null;
    
    if (parsed.parsing_confidence < 0.5) {
      parsingStatus = 'partial';
      parsingError = 'Low parsing confidence';
    } else if (!parsed.invoice_number || !parsed.total) {
      parsingStatus = 'partial';
      parsingError = 'Missing required fields';
    }

    // Generate ID
    const id = randomUUID();

    // Normalize dates to MM/DD/YYYY format before storage
    const normalizedInvoiceDate = normalizeDateForStorage(parsed.invoice_date);
    const normalizedDueDate = normalizeDateForStorage(parsed.due_date);

    // Insert invoice
    db.prepare(`
      INSERT INTO invoices (
        id,
        invoice_number,
        source_file,
        parsed_vendor_name,
        parsed_office_id,
        parsed_amount_cents,
        vendor_name,
        office_id,
        amount_cents,
        status,
        approvals,
        deleted,
        invoice_date,
        due_date,
        office_location,
        pdf_path,
        parsing_status,
        parsing_error,
        parse_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      invoiceNumber,
      sourceFile,
      normalizedVendor,
      parsed.office_location,
      amountCents,
      normalizedVendor,
      parsed.office_location,
      amountCents,
      'incoming',
      JSON.stringify({}),
      0,
      normalizedInvoiceDate,
      normalizedDueDate,
      parsed.office_location,
      buildApiPdfPath(normalizedPdfFilename),
      parsingStatus,
      parsingError,
      1
    );

    // Audit event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, payload_json)
      VALUES (?, 'PCS_AI_PARSED', ?)
    `).run(id, JSON.stringify({
      vendor_raw: rawVendor,
      vendor_validated: validatedVendor,
      vendor_match_method: vendorMatchMethod,
      vendor_confidence: vendorConfidence,
      amount_cents: amountCents,
      office_location: parsed.office_location,
      source: 'gpt-4o',
      confidence: parsed.parsing_confidence,
      knowledge_base_used: parseResult.knowledgeBaseUsed
    }));

    // Auto-categorize invoice
    try {
      const { categorizeInvoice, storeInvoiceCategories, mapLocationToClass } = await import('@/lib/invoices/categoryParser');
      // Convert line items to expected format (handle null values)
      const lineItems = (parsed.line_items || []).map(item => ({
        description: item.description || '',
        quantity: item.quantity ?? undefined,
        unit_price: item.unit_price ?? undefined,
        amount: item.amount ?? undefined
      }));
      const categories = await categorizeInvoice(
        {
          vendor_name: normalizedVendor,
          line_items: lineItems,
        },
        normalizedVendor
      );
      // Auto-fill class from parsed office_location if not already set
      const officeLocation = parsed.office_location || '';
      const classFromLocation = mapLocationToClass(officeLocation);
      if (classFromLocation) {
        for (const cat of categories) {
          if (!cat.className) {
            cat.className = classFromLocation;
            cat.classId = classFromLocation;
          }
        }
      }
      await storeInvoiceCategories(id, categories);
      console.log('[PCS_AI_INGEST] Auto-categorized invoice', {
        invoiceId: id,
        categories: categories.map(c => c.categoryName),
        classFromLocation,
      });
    } catch (err: any) {
      console.warn('[PCS_AI_INGEST] Failed to auto-categorize:', err?.message);
    }

    console.log('[PCS_AI_INGEST] Invoice ingested successfully:', {
      id,
      invoice_number: invoiceNumber,
      vendor: normalizedVendor,
      vendor_raw: rawVendor,
      vendor_match: vendorMatchMethod,
      amount: amountCents / 100,
      confidence: parsed.parsing_confidence,
      kb_used: parseResult.knowledgeBaseUsed
    });

    return NextResponse.json({
      ok: true,
      message: 'Invoice parsed and ingested successfully',
      id,
      invoice_number: invoiceNumber,
      vendor: normalizedVendor,
      vendor_raw: rawVendor,
      vendor_match_method: vendorMatchMethod,
      amount: amountCents / 100,
      parsing_status: parsingStatus,
      parsing_confidence: parsed.parsing_confidence,
      knowledge_base_used: parseResult.knowledgeBaseUsed,
      parsed_data: {
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        due_date: parsed.due_date,
        vendor_name: parsed.vendor_name,
        total: parsed.total,
        office_location: parsed.office_location,
        line_items_count: parsed.line_items?.length || 0
      }
    });

  } catch (err: any) {
    console.error('[PCS_AI_INGEST] Error:', err?.message);
    return NextResponse.json(
      { error: 'Ingestion failed', details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invoices/gpt-ingest
 * Health check for PCS AI ingestion
 */
export async function GET() {
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  
  return NextResponse.json({
    service: 'gpt-ingest',
    status: hasApiKey ? 'ready' : 'not_configured',
    apiKeyConfigured: hasApiKey,
    model: process.env.GPT_MODEL || 'gpt-4o-mini'
  });
}
