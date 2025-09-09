import { NextRequest, NextResponse } from 'next/server'
import { categorizeInvoiceLines } from '@/lib/categorize'
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
async function saveLineCategories(invoiceId: string, categories: any[]) {
  const filePath = path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  
  const invoiceIndex = data.findIndex((inv: any) => inv.id === invoiceId || inv.invoice_number === invoiceId)
  if (invoiceIndex === -1) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }
  
  // Add line categories to the invoice
  if (!data[invoiceIndex].line_categories) {
    data[invoiceIndex].line_categories = {}
  }
  
  categories.forEach(({ index, categoryId, categoryName, confidence, source }) => {
    data[invoiceIndex].line_categories[index] = {
      categoryId,
      categoryName,
      confidence,
      source,
      updatedAt: new Date().toISOString()
    }
  })
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// Get QuickBooks categories
async function getQboCategories() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.pcsmilesai.com'}/api/qbo/categories`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch QBO categories: ${response.status}`)
  }
  
  const data = await response.json()
  return data.categories || []
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id
    
    // Load invoice data
    const invoice = await loadInvoice(invoiceId)
    
    // Get QuickBooks categories
    const categories = await getQboCategories()
    
    // Prepare line items for categorization
    const lines = (invoice.line_items || []).map((item: any) => ({
      description: item.description || item.item_description || '',
      vendor: invoice.vendor_name || invoice.vendor,
      qty: item.quantity || item.qty,
      unit: item.unit_price || item.unit,
      total: item.total || item.line_total
    }))
    
    // Categorize the lines
    const results = categorizeInvoiceLines(lines, invoice.vendor_name || invoice.vendor || '', categories)
    
    // Save the results
    await saveLineCategories(invoiceId, results)
    
    return NextResponse.json({ 
      ok: true, 
      assignments: results,
      invoiceId,
      lineCount: lines.length,
      categorizedCount: results.filter(r => r.categoryId).length
    })
    
  } catch (error: any) {
    console.error('[Auto-categorize] Error:', error)
    return NextResponse.json(
      { error: 'Failed to categorize invoice', detail: error.message },
      { status: 500 }
    )
  }
}
