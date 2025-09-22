import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { invoice_number, status, approved } = await req.json()
    if (!invoice_number) {
      return NextResponse.json({ ok: false, error: 'invoice_number required' }, { status: 400 })
    }

    const possiblePaths = [
      path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json'),
      path.join(process.cwd(), 'invoice_queue.json'),
      path.join(process.cwd(), 'public', 'invoice_queue.json'),
    ]

    const existingPaths = possiblePaths.filter(p => fs.existsSync(p))
    if (existingPaths.length === 0) {
      return NextResponse.json({ ok: false, error: 'invoice_queue.json not found' }, { status: 404 })
    }

    // Update all existing files for safety
    let anyUpdated = false
    for (const filePath of existingPaths) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8')
        const data = JSON.parse(raw)
        const invoices = Array.isArray(data) ? data : (data.invoices || [])

        let updated = false
        const updatedInvoices = invoices.map((inv: any) => {
          const left = String(inv.invoice_number ?? '')
          const right = String(invoice_number)
          if (left === right) {
            updated = true
            return {
              ...inv,
              status: status ?? inv.status,
              approved: typeof approved === 'boolean' ? approved : inv.approved,
              timestamp: new Date().toISOString(),
            }
          }
          return inv
        })

        if (updated) {
          anyUpdated = true
          const toWrite: any = Array.isArray(data) ? updatedInvoices : { ...data, invoices: updatedInvoices }
          fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2))
        }
      } catch (e) {
        // Continue with other paths
      }
    }

    if (!anyUpdated) {
      return NextResponse.json({ ok: false, error: 'invoice not found in any queue file' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, updated: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'update failed' }, { status: 500 })
  }
}


