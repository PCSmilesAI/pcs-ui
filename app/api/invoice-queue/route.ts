import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Try multiple possible file locations
    const possiblePaths = [
      path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json'),
      path.join(process.cwd(), 'invoice_queue.json'),
      path.join(process.cwd(), 'public', 'invoice_queue.json')
    ]
    
    let filePath: string | null = null
    let data: any[] = []
    
    // Find the first existing file
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath
        console.log(`📂 Using invoice queue from: ${filePath}`)
        break
      }
    }
    
    if (!filePath) {
      console.error('❌ Invoice queue not found in any of these locations:', possiblePaths)
      return NextResponse.json({ error: 'Invoice queue not found' }, { status: 404 })
    }
    
    const rawData = fs.readFileSync(filePath, 'utf8')
    const parsedData = JSON.parse(rawData)
    
    // Handle both array and object formats
    if (Array.isArray(parsedData)) {
      data = parsedData
    } else if (parsedData.invoices && Array.isArray(parsedData.invoices)) {
      data = parsedData.invoices
    } else {
      console.warn('⚠️ Unexpected invoice queue format:', typeof parsedData)
      data = []
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
        filePath,
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
