// api.js - handles invoice + vendor API access

const BASE_URL = "https://api.pcsmilesai.com/api"; // live backend URL

export async function getInvoices() {
  try {
    const res = await fetch(`${BASE_URL}/invoices`);
    if (!res.ok) throw new Error("Failed to fetch invoices");
    return await res.json();
  } catch (err) {
    console.error("getInvoices error:", err);
    return [];
  }
}

export async function getVendors() {
  try {
    const res = await fetch(`${BASE_URL}/vendors`);
    if (!res.ok) throw new Error("Failed to fetch vendors");
    return await res.json();
  } catch (err) {
    console.error("getVendors error:", err);
    return [];
  }
}

export async function getInvoiceDetails(invoiceId) {
  try {
    const res = await fetch(`${BASE_URL}/invoices/${invoiceId}`);
    if (!res.ok) throw new Error("Failed to fetch invoice detail");
    return await res.json();
  } catch (err) {
    console.error("getInvoiceDetails error:", err);
    return null;
  }
}
