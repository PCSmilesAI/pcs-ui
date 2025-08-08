// Simple client-side overrides to persist status/approved changes when
// the backend API cannot write to files (e.g., static hosting on Vercel)

const STORAGE_KEY = 'invoiceStatusOverrides';

export function getOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function setOverride(invoiceNumber, changes) {
  try {
    const overrides = getOverrides();
    overrides[invoiceNumber] = {
      ...(overrides[invoiceNumber] || {}),
      ...changes,
      // Track when the override was made
      override_timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    // Ignore storage failures (private mode, etc.)
  }
}

export function clearOverrides() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Ignore
  }
}

export function applyOverrides(invoices) {
  const overrides = getOverrides();
  if (!overrides || Object.keys(overrides).length === 0) return invoices;
  return invoices.map((inv) => {
    const ov = overrides[inv.invoice_number];
    if (!ov) return inv;
    return {
      ...inv,
      ...(ov.status ? { status: ov.status } : {}),
      ...(typeof ov.approved === 'boolean' ? { approved: ov.approved } : {}),
      // Bubble the timestamp for sorting/debug if needed
      timestamp: ov.override_timestamp || inv.timestamp,
    };
  });
}


