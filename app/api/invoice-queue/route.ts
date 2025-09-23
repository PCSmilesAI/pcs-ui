import { NextResponse, NextRequest } from 'next/server'
import { dedupeInvoices, getExistingQueueFiles, saveQueueFiles } from '../../../lib/queue/invoiceQueue'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const queueFiles = getExistingQueueFiles()
    if (queueFiles.length === 0) {
      console.error('❌ Invoice queue not found in any known location')
      return NextResponse.json({ error: 'Invoice queue not found' }, { status: 404 })
    }

    const primary = queueFiles[0]
    let data = primary.invoices

    const { invoices: deduped, duplicatesRemoved } = dedupeInvoices(data)
    if (duplicatesRemoved > 0) {
      console.log(`🧹 Removed ${duplicatesRemoved} duplicate invoices from queue`)
      saveQueueFiles(queueFiles, deduped)
      data = deduped
    }
    
    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const vendor = searchParams.get('vendor') || ''
    const debug = searchParams.get('debug') === 'true'
    
    if (debug) {
      console.log('🔍 Debug info:', {
        totalInvoices: data.length,
        filePath: primary.filePath,
        queryParams: { limit, offset, search, status, vendor },
        sampleInvoices: data.slice(0, 2).map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          vendor: inv.vendor_name || inv.vendor,
          status: inv.status
        }))
      })
    }
    
    // Apply filters
    let filteredData = data
    
    if (search) {
      filteredData = filteredData.filter(inv => 
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
        (inv.vendor_name && inv.vendor_name.toLowerCase().includes(search.toLowerCase())) ||
        (inv.vendor && inv.vendor.toLowerCase().includes(search.toLowerCase()))
      )
    }
    
    if (status) {
      filteredData = filteredData.filter(inv => inv.status === status)
    }
    
    if (vendor) {
      filteredData = filteredData.filter(inv => 
        (inv.vendor_name && inv.vendor_name.toLowerCase().includes(vendor.toLowerCase())) ||
        (inv.vendor && inv.vendor.toLowerCase().includes(vendor.toLowerCase()))
      )
    }
    
    // Apply pagination
    const paginatedData = filteredData.slice(offset, offset + limit)
    
    return NextResponse.json({
      ok: true,
      count: filteredData.length,
      invoices: paginatedData
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('❌ Error loading invoice queue:', error)
    return NextResponse.json({ 
      error: 'Failed to load invoice queue',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
