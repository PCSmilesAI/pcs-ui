import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/db/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

// Get the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/var/www/pcs-ui';
const EMAIL_INVOICES_DIR = process.env.EMAIL_INVOICES_DIR || path.join(PROJECT_ROOT, 'pcs_ui_data', 'email_invoices');
const OUTPUT_JSONS_DIR = process.env.OUTPUT_JSONS_DIR || path.join(PROJECT_ROOT, 'pcs_ui_data', 'output_jsons');
const VENDOR_ROUTER_PATH = process.env.VENDOR_ROUTER_PATH || path.join(PROJECT_ROOT, 'vendor_router.py');

interface Invoice {
  id: string;
  invoice_number: string;
  pdf_path: string | null;
  source_file: string | null;
  vendor_name: string | null;
  amount_cents: number | null;
  parsing_status: string | null;
  parse_attempts: number | null;
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
 * Find the output JSON file for a parsed PDF
 */
function findOutputJson(pdfPath: string): Record<string, unknown> | null {
  const pdfFilename = path.basename(pdfPath);
  const baseName = pdfFilename.replace(/\.pdf$/i, '');
  
  // Try exact match first
  const exactPath = path.join(OUTPUT_JSONS_DIR, baseName + '.json');
  if (fs.existsSync(exactPath)) {
    try {
      return JSON.parse(fs.readFileSync(exactPath, 'utf-8'));
    } catch {
      return null;
    }
  }
  
  // Try finding by prefix (in case of hash differences)
  try {
    const files = fs.readdirSync(OUTPUT_JSONS_DIR);
    const baseWithoutHash = baseName.replace(/_[a-f0-9]{8}$/i, '');
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const fileBase = file.replace(/\.json$/i, '').replace(/_[a-f0-9]{8}$/i, '');
        if (fileBase.toLowerCase() === baseWithoutHash.toLowerCase()) {
          const jsonPath = path.join(OUTPUT_JSONS_DIR, file);
          return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        }
      }
    }
  } catch {
    return null;
  }
  
  return null;
}

/**
 * POST /api/invoices/[id]/reparse
 * Re-parses an invoice's PDF file and updates the database with new data
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

    // Get the invoice
    const invoice = db.prepare(`
      SELECT id, invoice_number, pdf_path, source_file, vendor_name, amount_cents, 
             parsing_status, parse_attempts
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

    console.log('[REPARSE] Running vendor_router on:', pdfPath);

    // Run the vendor_router.py parser
    let parseSuccess = false;
    let parseError = '';
    
    try {
      execSync(
        `python3 ${VENDOR_ROUTER_PATH} "${pdfPath}"`,
        { 
          cwd: path.dirname(VENDOR_ROUTER_PATH),
          timeout: 120000, // 2 minute timeout
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );
      parseSuccess = true;
    } catch (err: unknown) {
      parseError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[REPARSE] Parser failed:', parseError);
    }

    if (!parseSuccess) {
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
        { error: 'Parser failed', details: parseError.substring(0, 200) },
        { status: 500 }
      );
    }

    // Find and parse the output JSON
    const jsonData = findOutputJson(pdfPath);

    if (!jsonData) {
      db.prepare(`
        UPDATE invoices 
        SET parsing_status = 'failed',
            parsing_error = 'No JSON output from parser',
            parse_attempts = COALESCE(parse_attempts, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);

      return NextResponse.json(
        { error: 'Parser ran but no output was generated' },
        { status: 500 }
      );
    }

    // Extract data from JSON
    const vendor = (jsonData.vendor_name as string) || (jsonData.vendor as string) || invoice.vendor_name || '';
    const total = (jsonData.total as string) || (jsonData.invoice_total as string) || '';
    const officeLocation = (jsonData.office_location as string) || '';
    const invoiceDate = (jsonData.invoice_date as string) || '';
    const dueDate = (jsonData.due_date as string) || '';

    // Parse amount
    let amountCents = 0;
    if (total) {
      const totalStr = String(total).replace(/[^0-9.]/g, '');
      const totalNum = parseFloat(totalStr);
      if (!isNaN(totalNum)) {
        amountCents = Math.round(totalNum * 100);
      }
    }

    // Determine parsing status
    const hasAmount = amountCents > 0;
    const hasVendor = vendor && vendor !== 'Unknown' && vendor.trim() !== '';
    
    let parsingStatus = 'success';
    let parsingError: string | null = null;
    
    if (!hasAmount && !hasVendor) {
      parsingStatus = 'failed';
      parsingError = 'No data extracted from invoice';
    } else if (!hasAmount) {
      parsingStatus = 'partial';
      parsingError = 'Invoice total not extracted';
    }

    // Update database with new data
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

    // Log the event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, payload_json)
      VALUES (?, 'REPARSE', ?)
    `).run(id, JSON.stringify({
      old_amount_cents: invoice.amount_cents,
      new_amount_cents: amountCents,
      old_vendor: invoice.vendor_name,
      new_vendor: vendor,
      parsing_status: parsingStatus,
      parse_attempts: (invoice.parse_attempts || 0) + 1
    }));

    console.log('[REPARSE] Success:', {
      invoiceId: id,
      invoiceNumber: invoice.invoice_number,
      amountCents,
      vendor,
      parsingStatus
    });

    return NextResponse.json({
      ok: true,
      message: parsingStatus === 'success' 
        ? 'Invoice re-parsed successfully' 
        : 'Invoice re-parsed but some data could not be extracted',
      invoice_number: invoice.invoice_number,
      amount: amountCents > 0 ? (amountCents / 100).toFixed(2) : null,
      vendor,
      parsing_status: parsingStatus,
      parsing_error: parsingError
    });

  } catch (err: unknown) {
    console.error('[REPARSE] Error:', err);
    return NextResponse.json(
      { error: 'Failed to re-parse invoice' },
      { status: 500 }
    );
  }
}

