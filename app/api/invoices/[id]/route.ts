import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveDataPath } from '../../../../lib/workflow/dataDir';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    
    // Load the invoice queue
    const invoiceQueuePath = resolveDataPath('invoice_queue.json');
    
    if (!fs.existsSync(invoiceQueuePath)) {
      return NextResponse.json({ error: 'Invoice queue not found' }, { status: 404 });
    }
    
    const raw = JSON.parse(fs.readFileSync(invoiceQueuePath, 'utf8'));
    const invoices = Array.isArray(raw) ? raw : Array.isArray(raw?.invoices) ? raw.invoices : [];
    
    // Find the invoice by ID
    const invoice = invoices.find((inv: any) => inv.id === invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      ok: true, 
      invoice 
    });
    
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
