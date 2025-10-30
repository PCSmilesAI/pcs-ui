import { NextRequest, NextResponse } from 'next/server'
import {
  dedupeInvoices,
  getExistingQueueFiles,
  saveQueueFiles,
  updateInvoiceInList,
  InvoiceRecord,
} from '../../../lib/queue/invoiceQueue'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { invoice_number, status, approved } = await req.json()
    if (!invoice_number) {
      return NextResponse.json({ ok: false, error: 'invoice_number required' }, { status: 400 })
    }

    const queueFiles = getExistingQueueFiles()
    if (queueFiles.length === 0) {
      return NextResponse.json({ ok: false, error: 'invoice_queue.json not found' }, { status: 404 })
    }

    let updatedAny = false
    let duplicatesRemoved = 0

    const nextInvoicesByFile: InvoiceRecord[][] = []

    for (const queueFile of queueFiles) {
      const { invoices: deduped, duplicatesRemoved: removed } = dedupeInvoices(queueFile.invoices)
      duplicatesRemoved += removed

      const { updated, invoices } = updateInvoiceInList(deduped, String(invoice_number), (invoice) => ({
        ...invoice,
        status: status ?? invoice.status,
        approved: typeof approved === 'boolean' ? approved : invoice.approved,
        timestamp: new Date().toISOString(),
      }))

      updatedAny = updatedAny || updated
      nextInvoicesByFile.push(invoices)
    }

    if (!updatedAny) {
      return NextResponse.json({ ok: false, error: 'invoice not found in queue' }, { status: 404 })
    }

    if (updatedAny || duplicatesRemoved > 0) {
      const merged: InvoiceRecord[] = []
      for (const invoices of nextInvoicesByFile) {
        merged.push(...invoices)
      }
      const { invoices: finalInvoices } = dedupeInvoices(merged)
      saveQueueFiles(queueFiles, finalInvoices)
    }

    return NextResponse.json({ ok: true, updated: true, duplicatesRemoved })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'update failed' }, { status: 500 })
  }
}
