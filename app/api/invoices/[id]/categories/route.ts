import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { resolveDataPath } from '../../../../../lib/workflow/dataDir'
import { isValidInvoiceId } from '../../../../../lib/security/type-validation'
import { getDatabase } from '../../../../../lib/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Load invoice data from JSON file (legacy) or database
async function loadInvoice(invoiceId: string) {
  // First try database
  try {
    const db = getDatabase()
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(invoiceId, invoiceId)
    if (invoice) {
      return { source: 'database', invoice }
    }
  } catch (err) {
    console.log('[categories] Database lookup failed, trying JSON file:', err)
  }

  // Fallback to JSON file
  const filePath = resolveDataPath('invoice_queue.json')
  
  if (!fs.existsSync(filePath)) {
    // Return null instead of throwing - let caller handle gracefully
    return null
  }
  
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const invoices = Array.isArray(raw) ? raw : Array.isArray(raw?.invoices) ? raw.invoices : []
    const invoice = invoices.find((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
    
    if (invoice) {
      return { source: 'json', invoice }
    }
  } catch (err) {
    console.log('[categories] JSON file parse failed:', err)
  }
  
  return null
}

// Save line categories back to the invoice (legacy - for JSON-based invoices)
async function saveLineCategories(invoiceId: string, categories: any) {
  const filePath = resolveDataPath('invoice_queue.json')
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Invoice queue file not found')
  }
  
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const isArray = Array.isArray(raw)
  const data = isArray ? raw : Array.isArray(raw?.invoices) ? raw.invoices : []
  
  const invoiceIndex = data.findIndex((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  if (invoiceIndex === -1) {
    throw new Error(`Invoice ${invoiceId} not found in JSON queue`)
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

    const result = await loadInvoice(invoiceId)
    
    // If not found, return empty data gracefully instead of 500 error
    if (!result) {
      return NextResponse.json({ 
        ok: true,
        invoiceId,
        lineCategories: {},
        lineCount: 0,
        message: 'Invoice not found in legacy queue - use invoice-categories endpoint for database invoices'
      })
    }
    
    const { source, invoice } = result
    
    // For database invoices, return empty line categories (use /invoice-categories for GL lines)
    if (source === 'database') {
      return NextResponse.json({ 
        ok: true,
        invoiceId,
        lineCategories: {},
        lineCount: 0,
        source: 'database',
        message: 'Use /invoice-categories endpoint for GL line management'
      })
    }
    
    // For JSON-based invoices (legacy)
    const lineCategories = invoice.line_categories || {}
    
    return NextResponse.json({ 
      ok: true,
      invoiceId,
      lineCategories,
      lineCount: (invoice.line_items || []).length,
      source: 'json'
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
    
    // Check if this is a database invoice
    const result = await loadInvoice(invoiceId)
    
    if (!result) {
      return NextResponse.json(
        { error: 'Invoice not found', detail: 'Invoice not found in database or JSON queue' },
        { status: 404 }
      )
    }
    
    if (result.source === 'database') {
      return NextResponse.json(
        { error: 'Use /invoice-categories endpoint', detail: 'This invoice is in the database. Use /api/invoices/{id}/invoice-categories endpoint for GL line management.' },
        { status: 400 }
      )
    }
    
    // Add timestamps to updated categories (legacy JSON flow)
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
