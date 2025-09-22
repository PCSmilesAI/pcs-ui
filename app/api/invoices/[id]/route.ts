import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    
    // Load the invoice queue
    const invoiceQueuePath = path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json');
    
    if (!fs.existsSync(invoiceQueuePath)) {
      return NextResponse.json({ error: 'Invoice queue not found' }, { status: 404 });
    }
    
    const invoiceQueue = JSON.parse(fs.readFileSync(invoiceQueuePath, 'utf8'));
    
    // Find the invoice by ID
    const invoice = invoiceQueue.find((inv: any) => inv.id === invoiceId);
    
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
