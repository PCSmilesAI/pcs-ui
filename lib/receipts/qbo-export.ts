/**
 * lib/receipts/qbo-export.ts
 *
 * Push an approved expense report to QuickBooks Online as a CreditCard
 * **Purchase** (the correct entity for credit-card spend).
 *
 * This reuses the platform QBO module (lib/qbo) for connection + token handling
 * and account/class lookups — it does NOT modify it. The Purchase POST is done
 * here against the QBO REST API with the platform's stored token, because
 * QBOClient only exposes Bill creation (Bills are for AP invoices, not card
 * spend). If/when lib/qbo grows a createPurchase(), this can delegate to it.
 *
 * Requires an active QBO connection (managed by the platform at /api/qbo/auth).
 * Degrades with a clear error when QBO isn't connected or accounts can't be resolved.
 */

import { qboClient } from '../qbo/qboClient';
import { tokenStorage } from '../qbo/tokenStorage';
import { getReportById, setReportQboResult, type ExpenseReport } from './reports-store';
import type { Receipt } from './db-store';

function qboBaseUrl(): string {
  return (process.env.QBO_ENVIRONMENT || 'sandbox') === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

interface QboAccount {
  id: string;
  name: string;
  fullName: string;
  type: string;
  acctNum?: string;
}

function leadingNumber(gl: string): string | null {
  const m = (gl || '').match(/\d{4,6}/);
  return m ? m[0] : null;
}

function resolveAccount(accounts: QboAccount[], gl: string): QboAccount | undefined {
  if (!gl) return undefined;
  const num = leadingNumber(gl);
  const nameOnly = gl.replace(/^\d+\s*/, '').trim().toLowerCase();
  return (
    (num ? accounts.find((a) => a.acctNum === num) : undefined) ||
    accounts.find((a) => a.fullName?.toLowerCase().endsWith(gl.toLowerCase())) ||
    accounts.find((a) => a.name?.toLowerCase() === nameOnly)
  );
}

export interface QboExportResult {
  purchaseId: string;
  report: (ExpenseReport & { receipts: Receipt[] }) | null;
}

export async function exportReportToQbo(reportId: string): Promise<QboExportResult> {
  const report = getReportById(reportId);
  if (!report) throw new Error('Report not found');
  if (report.qbo_purchase_id) {
    return { purchaseId: report.qbo_purchase_id, report };
  }
  if (report.status !== 'approved') {
    throw new Error('Only approved reports can be exported to QuickBooks');
  }
  if (report.receipts.length === 0) {
    throw new Error('Report has no receipts to export');
  }

  // Connection + fresh token (throws clearly if QBO isn't connected).
  await qboClient.initialize();
  await qboClient.ensureValidToken();
  const tokens = await tokenStorage.getLatestTokens();
  if (!tokens) throw new Error('QuickBooks is not connected. Connect it at /api/qbo/auth first.');

  const accounts = (await qboClient.getAllAccounts()) as QboAccount[];
  const classes = (await qboClient.getClasses()) as Array<{ id: string; name: string }>;

  // The credit-card account the charges post against (AMEX 21100 by convention).
  const amexAcctNum = process.env.QBO_AMEX_ACCOUNT_NUM || '21100';
  const amex =
    accounts.find((a) => a.acctNum === amexAcctNum) ||
    accounts.find((a) => /amex|credit card/i.test(a.name));
  if (!amex) {
    const msg = `No credit-card account found in QBO (looked for acctNum ${amexAcctNum} or a name containing "AMEX").`;
    setReportQboResult(reportId, { error: msg });
    throw new Error(msg);
  }

  const unresolved: string[] = [];
  const Line = report.receipts.map((r) => {
    const acct = resolveAccount(accounts, r.gl_account || '');
    if (!acct) unresolved.push(`${r.vendor || 'Unknown'} → "${r.gl_account || '(none)'}"`);
    const cls = r.location
      ? classes.find((c) => c.name.toLowerCase().includes(r.location.toLowerCase()))
      : undefined;
    return {
      Amount: Number(r.amount) || 0,
      DetailType: 'AccountBasedExpenseLineDetail',
      Description: r.vendor || r.notes || '',
      AccountBasedExpenseLineDetail: {
        AccountRef: acct ? { value: acct.id } : undefined,
        ClassRef: cls ? { value: cls.id } : undefined,
      },
    };
  });

  if (unresolved.length > 0) {
    const msg = `Could not map ${unresolved.length} GL account(s) to QBO: ${unresolved.join('; ')}`;
    setReportQboResult(reportId, { error: msg });
    throw new Error(msg);
  }

  const payload = {
    PaymentType: 'CreditCard',
    AccountRef: { value: amex.id, name: amex.name },
    TxnDate: (report.submitted_at || new Date().toISOString()).slice(0, 10),
    PrivateNote: `PCS expense report #${report.display_number} (${report.expense_count} receipts)`,
    Line,
  };

  const url = `${qboBaseUrl()}/v3/company/${tokens.realmId}/purchase?minorversion=70`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const msg = `QBO Purchase failed (HTTP ${res.status}): ${text.slice(0, 300)}`;
    setReportQboResult(reportId, { error: msg });
    throw new Error(msg);
  }

  const json: any = await res.json();
  const purchaseId = json?.Purchase?.Id;
  if (!purchaseId) {
    const msg = 'QBO did not return a Purchase Id';
    setReportQboResult(reportId, { error: msg });
    throw new Error(msg);
  }

  const updated = setReportQboResult(reportId, { purchaseId });
  return { purchaseId, report: updated };
}
