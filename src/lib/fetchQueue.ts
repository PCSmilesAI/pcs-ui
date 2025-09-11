// src/lib/fetchQueue.ts
export type Invoice = Record<string, any>

export async function fetchInvoiceQueue(
  params: Record<string, string | number> = {}
): Promise<Invoice[]> {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) usp.set(k, String(v))

  // IMPORTANT: client-side fetch with no cache
  const res = await fetch(`/api/invoice-queue?${usp.toString()}`, {
    cache: 'no-store',
  })

  const text = await res.text()
  let data: any
  try { 
    data = JSON.parse(text) 
  } catch {
    throw new Error(`Bad JSON from /api/invoice-queue: ${text.slice(0, 200)}`)
  }
  
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }

  const invoices = Array.isArray(data.invoices) ? data.invoices : []
  return invoices
}
