import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Load invoice data from JSON file
async function loadInvoice(invoiceId: string) {
  const filePath = path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json')
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Invoice queue file not found')
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const invoice = data.find((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }
  
  return invoice
}

// Save line categories back to the invoice
async function saveLineCategories(invoiceId: string, categories: any) {
  const filePath = path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  
  const invoiceIndex = data.findIndex((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  if (invoiceIndex === -1) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }
  
  // Update line categories
  data[invoiceIndex].line_categories = categories
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// GET - Retrieve current line categories
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id
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
