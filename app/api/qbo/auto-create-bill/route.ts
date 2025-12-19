import { NextRequest, NextResponse } from 'next/server';
import { autoBillService } from '../../../../lib/qbo/autoBillService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { invoiceData } = await req.json();
    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';

    if (!invoiceData) {
      return NextResponse.json({
        success: false,
        error: 'Invoice data is required'
      }, { status: 400 });
    }

    console.log('🔄 Auto-create bill request for invoice:', invoiceData.invoice_number, 'ID:', invoiceData.id);

    // Process the approved invoice - pass invoiceId for GL line lookup
    const result = await autoBillService.processApprovedInvoice(invoiceData, { 
      dryRun,
      invoiceId: invoiceData.id || invoiceData.invoice_id
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        billId: result.billId,
        pdfAttached: result.pdfAttached ?? false,
        categories: result.categories ?? [],
        dryRun,
        message: dryRun ? 'Dry run successful – no bill created' : 'Bill created successfully in QuickBooks'
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to create bill'
    }, { status: 500 });

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Auto-create bill error:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'Failed to create bill'
    }, { status: 500 });
  }
}

// Test connection endpoint
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const id = url.searchParams.get('id');

    // If an invoice id is provided, perform a dry-run (or real run) using
    // the invoice data loaded from the consolidated queue on disk.
    if (id) {
      try {
        // Attempt to load from multiple known locations
        const paths = [
          'pcs_ai_data/invoice_queue.json',
          'public/invoice_queue.json',
          'invoice_queue.json',
        ];

        let queue: any[] | null = null;
        for (const p of paths) {
          try {
            // dynamic import of fs to avoid edge bundling issues
            const { readFileSync, existsSync } = await import('fs');
            if (existsSync(p)) {
              const raw = readFileSync(p, 'utf8');
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                queue = parsed;
              } else if (Array.isArray(parsed?.invoices)) {
                queue = parsed.invoices;
              }
              if (queue) break;
            }
          } catch (_) {
            // continue to next path
          }
        }

        if (!queue || queue.length === 0) {
          return NextResponse.json({ ok: false, error: 'Invoice queue not found' }, { status: 404 });
        }

        const invoice = queue.find((inv) =>
          String(inv?.invoice_number || inv?.invoice || '').trim() === String(id).trim()
        );

        if (!invoice) {
          return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
        }

        console.log('🔄 Auto-create bill request for invoice:', id);

        const result = await autoBillService.processApprovedInvoice(invoice as any, { dryRun });
        if (result.success) {
          return NextResponse.json({ ok: true, dryRun, ...result });
        }
        return NextResponse.json({ ok: false, dryRun, error: result.error || 'Failed to create bill' }, { status: 500 });
      } catch (error: any) {
        // Log full error server-side only
        console.error('❌ Dry-run by id failed:', error);
        // Return safe error message to client
        return NextResponse.json({ ok: false, error: 'Dry-run failed' }, { status: 500 });
      }
    }

    // Default: simple connectivity probe
    const isConnected = await autoBillService.testConnection();
    const categories = await autoBillService.getDentalCategories();

    return NextResponse.json({
      connected: isConnected,
      categories: categories.length,
      message: isConnected ? 'QuickBooks connected successfully' : 'QuickBooks not connected'
    });

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Connection test error:', error);
    // Return safe error message to client
    return NextResponse.json({
      connected: false,
      error: 'Connection test failed'
    }, { status: 500 });
  }
}
