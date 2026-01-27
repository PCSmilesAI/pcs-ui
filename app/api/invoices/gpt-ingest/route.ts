import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { isTombstoned } from '../../../../lib/invoices/tombstoneService';
import { normalizeVendorNameForStorage } from '../../../../lib/invoices/vendorNormalization';
import { resolveVendor } from '../../../../lib/invoices/vendorMatcher';
import { buildApiPdfPath, normalizePdfFilename } from '../../../../lib/security/filename';
import { isPathWithinBase } from '../../../../lib/security/path-validation';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// Import PCS AI parsing
import { parseInvoiceWithGPT, ParseResult } from '../../../../lib/gpt/parseInvoice';
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
  const possiblePaths = [
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'pdfs', filename),
    path.join(process.cwd(), 'sample_invoices_pcs', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      if (isPathWithinBase(p, process.cwd())) {
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

    // Successfully parsed - extract data
    const parsed = parseResult.data;
    const rawVendor = parsed.vendor_name || parseResult.vendorDetected || 'Unknown';
    
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
      parsed.invoice_date,
      parsed.due_date,
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
      const { categorizeInvoice, storeInvoiceCategories } = await import('@/lib/invoices/categoryParser');
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
      await storeInvoiceCategories(id, categories);
      console.log('[PCS_AI_INGEST] Auto-categorized invoice', {
        invoiceId: id,
        categories: categories.map(c => c.categoryName),
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
