import { NextRequest, NextResponse } from 'next/server';
import { getById, save, listVisibleFor } from '../../../../lib/workflow/invoiceStore';
import { getExistingQueueFiles } from '../../../../lib/queue/invoiceQueue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Get invoices from queue
    const queueFiles = getExistingQueueFiles();
    if (queueFiles.length === 0) {
      return NextResponse.json({ ok: false, error: 'No queue files found' }, { status: 404 });
    }

    const queueInvoices = queueFiles[0].invoices;
    if (!Array.isArray(queueInvoices) || queueInvoices.length === 0) {
      return NextResponse.json({ ok: false, error: 'Queue is empty' }, { status: 400 });
    }

    // Load existing invoices from workflow store
    const existingInvoices = await listVisibleFor();
    const existingIds = new Set(
      existingInvoices.map(inv => inv.id || inv.invoice_number).filter(Boolean)
    );

    // Add new invoices from queue
    let added = 0;
    let skipped = 0;

    for (const queueInvoice of queueInvoices) {
      const invoiceId = queueInvoice.id || queueInvoice.invoice_number;
      
      if (existingIds.has(invoiceId)) {
        skipped++;
        continue;
      }

      // Ensure invoice has required fields
      const invoice = {
        ...queueInvoice,
        status: 'to_be_paid', // Set to to_be_paid for testing
        approvals: queueInvoice.approvals || {},
        approved: true,
      };

      await save(invoice);
      added++;
    }

    return NextResponse.json({
      ok: true,
      added,
      skipped,
      total: queueInvoices.length,
    });
  } catch (error: any) {
    console.error('[LOAD_FROM_QUEUE]', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load invoices' },
      { status: 500 }
    );
  }
}

