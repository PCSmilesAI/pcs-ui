/**
 * QuickBooks Online deep-link URL builders.
 * Bill page shows the bill and linked payments; BillPayment page is the payment receipt.
 */

export function getQboAppBaseUrl(): string {
  return 'https://app.qbo.intuit.com';
}

export function buildQboBillUrl(billId: string): string {
  return `${getQboAppBaseUrl()}/app/bill?txnId=${encodeURIComponent(billId)}`;
}

export function buildQboBillPaymentUrl(paymentId: string): string {
  return `${getQboAppBaseUrl()}/app/billpayment?txnId=${encodeURIComponent(paymentId)}`;
}

/** Prefer BillPayment receipt URL; fall back to Bill detail page. */
export function buildQboReceiptUrl(
  billId?: string | null,
  paymentId?: string | null
): string | null {
  if (paymentId) return buildQboBillPaymentUrl(paymentId);
  if (billId) return buildQboBillUrl(billId);
  return null;
}
