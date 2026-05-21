/**
 * lib/receipts/receipt-service.ts
 *
 * Business logic for the credit card receipts module.
 * Route handlers call this; this calls db-store.ts and any AI/LLM helpers.
 *
 * McKay — build your agent logic here. Suggested functions to implement:
 *
 *   parseReceiptImage(imagePath: string) → ReceiptParseResult
 *     Use the LLM (via process.env.PCS_LLM_PROVIDER + process.env.PCS_LLM_MODEL) to
 *     extract vendor, amount, date from a receipt image.
 *
 *   categorizeReceipt(receipt: Receipt) → string (GL account code)
 *     Use the GL account list from context/verticals/accounting.md to classify
 *     a receipt to the correct account.
 *
 *   matchReceiptToAmexTransaction(receipt: Receipt, transactions: AmexTransaction[]) → match | null
 *     Find the Amex transaction that matches this receipt (amount + date + vendor fuzzy match).
 *
 * MODEL CONVENTION — ALWAYS use environment variables, never hard-code:
 *   const provider = process.env.PCS_LLM_PROVIDER ?? 'openai';
 *   const model    = process.env.PCS_LLM_MODEL    ?? 'gpt-4o';
 *
 * CONTEXT FILES to load for this module:
 *   context/company/pcs_overview.md        (always)
 *   context/verticals/accounting.md        (for GL categorization)
 *   context/modules/credit_card_receipts.md (module-specific rules)
 */

export interface ReceiptParseResult {
  vendor: string;
  amount: number;
  date: string;
  confidence: number;
}

export async function parseReceiptImage(imagePath: string): Promise<ReceiptParseResult> {
  // TODO (McKay): implement receipt image parsing with your AI agent
  // Load context/modules/credit_card_receipts.md as the system prompt
  // Call the LLM using process.env.PCS_LLM_PROVIDER and process.env.PCS_LLM_MODEL
  throw new Error('parseReceiptImage not yet implemented');
}

export async function categorizeReceipt(vendor: string, amount: number): Promise<string> {
  // TODO (McKay): implement GL categorization
  // Load context/verticals/accounting.md for the GL account list
  // Return the best-matching GL account code
  throw new Error('categorizeReceipt not yet implemented');
}

export async function matchReceiptToAmexTransaction(
  receiptAmount: number,
  receiptDate: string,
  receiptVendor: string,
  transactions: Array<{ id: string; amount: number; date: string; vendor: string }>
): Promise<{ id: string; confidence: number } | null> {
  // TODO (McKay): implement Amex transaction matching
  // Use fuzzy date/amount/vendor comparison
  // Return the best match and a confidence score, or null if no match found
  return null;
}
