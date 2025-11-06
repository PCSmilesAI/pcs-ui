import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { applyParserUpdate } from '../../../../lib/invoices/write';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

interface IngestPayload {
  invoice_number: string;
  vendor: string;
  total?: string | number;
  office_location?: string;
  invoice_date?: string;
  clinic_id?: string;
  source_file?: string;
  json_path?: string;
  pdf_path?: string;
  [key: string]: any;
}

/**
 * Ingest a parsed invoice from the parser/queue writer.
 * This endpoint is called by invoice_queue_writer.py after parsing.
 * It inserts the invoice into the database with parsed_* fields.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as IngestPayload;
    
    if (!body.invoice_number || !body.vendor) {
      return NextResponse.json(
        { error: 'invoice_number and vendor are required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    
    // Check if invoice already exists
    const existing = db.prepare(
      'SELECT id FROM invoices WHERE invoice_number = ?'
    ).get(body.invoice_number);
    
    if (existing) {
      return NextResponse.json(
        { ok: true, message: 'Invoice already exists', id: (existing as any).id },
        { status: 200 }
      );
    }

    // Generate ID
    const id = randomUUID();
    
    // Parse amount
    let amountCents = 0;
    if (body.total) {
      const totalStr = String(body.total).replace(/[^0-9.]/g, '');
      const totalNum = parseFloat(totalStr);
      if (!isNaN(totalNum)) {
        amountCents = Math.round(totalNum * 100);
      }
    }

    // Insert invoice with parsed_* fields
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
        description,
        clinic_id,
        office_location,
        pdf_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.invoice_number,
      body.source_file || body.json_path,
      body.vendor,
      body.office_location || body.clinic_id,
      amountCents,
      body.vendor,  // effective = parsed initially
      body.office_location || body.clinic_id,  // effective
      amountCents,  // effective
      'incoming',
      JSON.stringify({}),
      0,
      body.invoice_date,
      '',
      body.clinic_id,
      body.office_location,
      body.pdf_path
    );

    // Audit event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, payload_json)
      VALUES (?, 'PARSED_UPDATE', ?)
    `).run(id, JSON.stringify({
      vendor: body.vendor,
      amount_cents: amountCents,
      office_location: body.office_location,
      source: 'parser'
    }));

    console.log('[API][INGEST]', 'invoice_ingested', {
      invoiceNumber: body.invoice_number,
      vendor: body.vendor,
      amountCents,
      id
    });

    return NextResponse.json({
      ok: true,
      message: 'Invoice ingested successfully',
      id,
      invoice_number: body.invoice_number
    });
  } catch (err: any) {
    console.error('[API][INGEST]', 'error', { error: err?.message });
    return NextResponse.json(
      { error: err?.message || 'Ingestion failed' },
      { status: 500 }
    );
  }
}

