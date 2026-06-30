/** Client-side QBO deep-link helpers (mirrors lib/qbo/qboUrls.ts). */

export function buildQboBillUrl(billId) {
  return `https://app.qbo.intuit.com/app/bill?txnId=${encodeURIComponent(billId)}`;
}

export function buildQboBillPaymentUrl(paymentId) {
  return `https://app.qbo.intuit.com/app/billpayment?txnId=${encodeURIComponent(paymentId)}`;
}

export function buildQboReceiptUrl(billId, paymentId) {
  if (paymentId) return buildQboBillPaymentUrl(paymentId);
  if (billId) return buildQboBillUrl(billId);
  return null;
}
