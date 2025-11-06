import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { getExistingQueueFiles } from '../../../../lib/queue/invoiceQueue';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Migrate invoices from JSON queue to SQLite database
 * This endpoint reads invoices from the JSON queue file and inserts them into the database
 */
export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    
    // Get invoices from queue files
    const queueFiles = getExistingQueueFiles();
    if (queueFiles.length === 0) {
      return NextResponse.json({ ok: false, error: 'No queue files found' }, { status: 404 });
    }

    const queueInvoices = queueFiles[0].invoices;
    if (!Array.isArray(queueInvoices) || queueInvoices.length === 0) {
      return NextResponse.json({ ok: false, error: 'Queue is empty' }, { status: 400 });
    }

    // Check how many invoices already exist in database
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get() as any;
    const existingIds = new Set<string>();
    
    if (existingCount.count > 0) {
      const existing = db.prepare('SELECT id, invoice_number FROM invoices').all() as any[];
      existing.forEach(inv => {
        existingIds.add(inv.id);
        existingIds.add(inv.invoice_number);
      });
    }

    // Migrate invoices
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const queueInv of queueInvoices) {
      try {
        const invoiceId = queueInv.id || queueInv.invoice_number;
        
        if (existingIds.has(invoiceId)) {
          skipped++;
          continue;
        }

        const id = queueInv.id || uuidv4();
        
        // Insert invoice with parsed values (from JSON)
        db.prepare(`
          INSERT INTO invoices (
            id,
            invoice_number,
            source_file,
            source_message_id,
            parsed_vendor_name,
            parsed_office_id,
            parsed_amount_cents,
            vendor_name,
            office_id,
            amount_cents,
            status,
            approvals,
            deleted,
            workflow_deleted_at,
            invoice_date,
            due_date,
            description,
            category,
            clinic_id,
            office_location,
            vendor_id,
            pdf_path,
            total,
            invoice_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          queueInv.invoice_number,
          queueInv.source_file,
          queueInv.source_message_id,
          queueInv.vendor_name,  // parsed
          queueInv.office_id,    // parsed
          queueInv.amount_cents, // parsed
          queueInv.vendor_name,  // effective (same as parsed initially)
          queueInv.office_id,    // effective
          queueInv.amount_cents, // effective
          queueInv.status || 'incoming',
          JSON.stringify(queueInv.approvals || {}),
          queueInv.deleted ? 1 : 0,
          queueInv.workflow_deleted_at,
          queueInv.invoice_date,
          queueInv.due_date,
          queueInv.description,
          queueInv.category,
          queueInv.clinic_id,
          queueInv.office_location,
          queueInv.vendor_id,
          queueInv.pdf_path,
          queueInv.total,
          queueInv.invoice_total
        );
        
        migrated++;
      } catch (err: any) {
        errors.push(`Failed to migrate ${queueInv.invoice_number}: ${err?.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      migrated,
      skipped,
      total: queueInvoices.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[MIGRATE_TO_DB]', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Migration failed' },
      { status: 500 }
    );
  }
}

