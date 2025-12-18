import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/db/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

// Get the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/var/www/pcs-ui';
const EMAIL_INVOICES_DIR = process.env.EMAIL_INVOICES_DIR || path.join(PROJECT_ROOT, 'pcs_ui_data', 'email_invoices');

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
function getPdfFilename(pdfPath: string | null): string | null {
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
 */
function findPdfFile(pdfFilename: string | null): string | null {
  if (!pdfFilename) return null;
  
  const directPath = path.join(EMAIL_INVOICES_DIR, pdfFilename);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  
  // Try without hash suffix
  const baseName = pdfFilename.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
  
  try {
    const files = fs.readdirSync(EMAIL_INVOICES_DIR);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.pdf')) {
        const fileBase = file.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
        if (fileBase.toLowerCase() === baseName.toLowerCase()) {
          return path.join(EMAIL_INVOICES_DIR, file);
        }
      }
    }
  } catch (err) {
    console.error('[REPARSE] Error reading directory:', err);
  }
  
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
 * Re-parses an invoice's PDF file using the ISOLATED smart_reparse.py script.
 * This does NOT use the main parsing pipeline (vendor_router.py).
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
    const pdfFilename = getPdfFilename(invoice.pdf_path);
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

    // Determine which fields need focused extraction
    const missingFields = getMissingFields(invoice);
    const focusArg = missingFields.length > 0 ? `--focus=${missingFields.join(',')}` : '';
    
    // Force OCR if there have been previous failed attempts
    const forceOcr = (invoice.parse_attempts || 0) >= 1;
    const ocrArg = forceOcr ? '--force-ocr' : '';

    console.log('[REPARSE] Running smart_reparse on:', pdfPath);
    console.log('[REPARSE] Missing fields:', missingFields);
    console.log('[REPARSE] Force OCR:', forceOcr);

    // Run the ISOLATED smart_reparse.py script
    let reparseResult: SmartReparseResult | null = null;
    let parseError = '';
    
    try {
      const command = `python3 "${SMART_REPARSE_PATH}" "${pdfPath}" ${focusArg} ${ocrArg} --invoice-id="${id}"`;
      console.log('[REPARSE] Command:', command);
      
      const output = execSync(command, { 
        cwd: path.dirname(SMART_REPARSE_PATH),
        timeout: 120000, // 2 minute timeout
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Parse the JSON output from smart_reparse.py
      try {
        reparseResult = JSON.parse(output) as SmartReparseResult;
      } catch (jsonErr) {
        console.error('[REPARSE] Failed to parse JSON output:', output);
        parseError = 'Failed to parse reparse output';
      }
    } catch (err: unknown) {
      // execSync throws on non-zero exit, but we might still have stdout
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
      // Update parsing status to indicate parser failure
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

    // Extract data from the reparse result
    const extracted = reparseResult.extracted || {};
    const vendor = extracted.vendor || '';
    const amountCents = extracted.amount_cents || 0;
    const officeLocation = extracted.office_location || '';
    const invoiceDate = extracted.invoice_date || '';
    const dueDate = extracted.due_date || '';

    // Determine parsing status
    const hasAmount = amountCents > 0;
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

    // Update database with new data (only update fields that were extracted)
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

    // Log the event with detailed strategies used
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
