import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { resolveDataPath } from '../../../../../lib/workflow/dataDir'
import { isValidInvoiceId } from '../../../../../lib/security/type-validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Load invoice data from JSON file
async function loadInvoice(invoiceId: string) {
  const filePath = resolveDataPath('invoice_queue.json')
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Invoice queue file not found')
  }
  
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const invoices = Array.isArray(raw) ? raw : Array.isArray(raw?.invoices) ? raw.invoices : []
  const invoice = invoices.find((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }
  
  return invoice
}

// Save line categories back to the invoice
async function saveLineCategories(invoiceId: string, categories: any) {
  const filePath = resolveDataPath('invoice_queue.json')
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const isArray = Array.isArray(raw)
  const data = isArray ? raw : Array.isArray(raw?.invoices) ? raw.invoices : []
  
  const invoiceIndex = data.findIndex((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  if (invoiceIndex === -1) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }
  
  // Update line categories
  data[invoiceIndex].line_categories = categories
  
  const payload = isArray ? data : { ...(raw || {}), invoices: data }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

// GET - Retrieve current line categories
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id

    // SECURITY: Validate invoice ID format
    if (!isValidInvoiceId(invoiceId)) {
      console.warn('[API][INVOICES][CATEGORIES][GET]', 'invalid_invoice_id', { invoiceId });
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const invoice = await loadInvoice(invoiceId)
    
    const lineCategories = invoice.line_categories || {}
    
    return NextResponse.json({ 
      ok: true,
      invoiceId,
      lineCategories,
      lineCount: (invoice.line_items || []).length
    })
    
  } catch (error: any) {
    console.error('[Get categories] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get categories', detail: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update line categories
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id

    // SECURITY: Validate invoice ID format
    if (!isValidInvoiceId(invoiceId)) {
      console.warn('[API][INVOICES][CATEGORIES][PUT]', 'invalid_invoice_id', { invoiceId });
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const body = await request.json()
    const { lineCategories } = body
    
    if (!lineCategories || typeof lineCategories !== 'object') {
      return NextResponse.json(
        { error: 'Invalid lineCategories format' },
        { status: 400 }
      )
    }
    
    // Add timestamps to updated categories
    const now = new Date().toISOString()
    const updatedCategories = { ...lineCategories }
    
    Object.keys(updatedCategories).forEach(index => {
      if (updatedCategories[index]) {
        updatedCategories[index] = {
          ...updatedCategories[index],
          updatedAt: now,
          source: 'manual'
        }
      }
    })
    
    await saveLineCategories(invoiceId, updatedCategories)
    
    return NextResponse.json({ 
      ok: true,
      invoiceId,
      updatedCount: Object.keys(updatedCategories).length
    })
    
  } catch (error: any) {
    console.error('[Update categories] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update categories', detail: error.message },
      { status: 500 }
    )
  }
}
