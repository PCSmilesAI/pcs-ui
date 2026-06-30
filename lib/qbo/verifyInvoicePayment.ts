import type { InvoiceRecord } from '../invoices/db-store';
import { saveInvoice } from '../invoices/db-store';
import { QBOClient } from './qboClient';

export interface QboPaymentVerificationResult {
  paid: boolean;
  paymentId?: string | null;
  balance?: number;
}

/**
 * Check QBO bill balance and mark the PCS invoice paid when fully settled.
 * Stores the linked BillPayment ID for receipt deep links.
 */
export async function verifyAndMarkInvoicePaidFromQbo(
  invoice: InvoiceRecord,
  qboClient: QBOClient
): Promise<QboPaymentVerificationResult> {
  const qboBillId = invoice.qbo_bill_id;
  if (!qboBillId) {
    return { paid: false };
  }

  const bill = await qboClient.getBillById(qboBillId);
  if (!bill) {
    return { paid: false };
  }

  if (bill.Balance !== 0) {
    return { paid: false, balance: bill.Balance };
  }

  let paymentId = invoice.qbo_bill_payment_id || null;
  if (!paymentId) {
    paymentId = await qboClient.getBillPaymentIdForBill(qboBillId);
  }

  invoice.status = 'paid';
  if (!invoice.paid_at) {
    invoice.paid_at = new Date().toISOString();
  }
  invoice.payment_verified_at = new Date().toISOString();
  if (paymentId) {
    invoice.qbo_bill_payment_id = paymentId;
  }
  saveInvoice(invoice);

  return { paid: true, paymentId, balance: 0 };
}

/**
 * Backfill BillPayment ID on already-paid invoices missing a receipt link.
 */
export async function backfillQboBillPaymentId(
  invoice: InvoiceRecord,
  qboClient: QBOClient
): Promise<string | null> {
  if (!invoice.qbo_bill_id || invoice.qbo_bill_payment_id) {
    return invoice.qbo_bill_payment_id || null;
  }

  const paymentId = await qboClient.getBillPaymentIdForBill(invoice.qbo_bill_id);
  if (!paymentId) {
    return null;
  }

  invoice.qbo_bill_payment_id = paymentId;
  saveInvoice(invoice);
  return paymentId;
}
