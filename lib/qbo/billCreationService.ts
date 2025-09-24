import fs from 'fs';
import path from 'path';
import { qboClient, QBOBill } from './qboClient';
import { pickMappingForVendor } from './vendorMappings';
import { resolveAccountByFullName, resolveClassByFullName, resolveLocationByName } from './qboLookup';
import { isValidAccountPath } from './chartOfAccounts';

export interface InvoiceLineItem {
  product_name?: string;
  description?: string;
  name?: string;
  amount?: string | number;
  total?: string | number;
  line_item_total?: string | number;
  quantity?: string | number;
  Quantity?: string | number;
  unit_price?: string | number;
  UnitPrice?: string | number;
}

export interface InvoiceData {
  invoice_number?: string;
  invoiceNumber?: string;
  invoice_date?: string;
  invoiceDate?: string;
  due_date?: string;
  dueDate?: string;
  vendor?: string;
  vendor_name?: string;
  vendorName?: string;
  total?: string | number;
  amount?: string | number;
  totalAmount?: string | number;
  pdf_path?: string;
  pdfPath?: string;
  json_path?: string;
  jsonPath?: string;
  line_items?: InvoiceLineItem[];
  lineItems?: InvoiceLineItem[];
  [key: string]: any;
}

export interface BillCreationOptions {
  invoiceData: InvoiceData;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  pdfPath?: string;
  totalAmount?: number;
  dryRun?: boolean;
}

export interface BillCreationResult {
  success: boolean;
  billId?: string;
  pdfAttached?: boolean;
  categories?: Array<{ description: string; category: string }>;
  error?: string;
}

const DENTAL_CATEGORY_MAPPING: Record<string, string[]> = {
  supplies: ['supply', 'supplies', 'material', 'materials', 'consumable'],
  dental_supplies: ['dental', 'tooth', 'teeth', 'oral', 'mouth'],
  instruments: ['instrument', 'tool', 'drill', 'scalpel', 'probe'],
  disposables: ['disposable', 'glove', 'mask', 'gauze', 'cotton'],
  equipment: ['equipment', 'machine', 'device', 'unit', 'system'],
  xray_equipment: ['x-ray', 'xray', 'radiograph', 'imaging'],
  dental_chairs: ['chair', 'seat', 'unit'],
  lab_work: ['lab', 'laboratory', 'crown', 'bridge', 'implant', 'denture'],
  crowns: ['crown', 'cap', 'restoration'],
  bridges: ['bridge', 'fixed'],
  dentures: ['denture', 'partial', 'complete'],
  cleaning: ['cleaning', 'prophylaxis', 'hygiene', 'scaling'],
  filling: ['filling', 'composite', 'amalgam', 'restoration'],
  extraction: ['extraction', 'removal', 'surgery'],
  orthodontic: ['orthodontic', 'braces', 'aligner', 'retainer'],
  anesthesia: ['anesthesia', 'numbing', 'lidocaine', 'novocaine'],
  medication: ['medication', 'drug', 'prescription', 'antibiotic']
};

function categorizeLineItem(description: string, amount: number): string {
  const desc = description.toLowerCase();

  for (const [category, keywords] of Object.entries(DENTAL_CATEGORY_MAPPING)) {
    if (keywords.some(keyword => desc.includes(keyword))) {
      return category;
    }
  }

  if (amount > 1000) return 'equipment';
  if (amount > 100) return 'lab_work';
  if (amount > 10) return 'dental_supplies';
  return 'supplies';
}

function sanitizeAmount(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseDateInput(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10) - 1;
    const day = Number.parseInt(slashMatch[2], 10);
    let year = Number.parseInt(slashMatch[3], 10);
    if (slashMatch[3].length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}

export function formatDate(dateString: string | undefined | null): string | undefined {
  const parsed = parseDateInput(dateString);
  if (!parsed) return undefined;
  return parsed.toISOString().split('T')[0];
}

function resolvePdfFile(pdfPath?: string): { buffer: Buffer; fileName: string } | null {
  if (!pdfPath) return null;

  const candidates = new Set<string>();
  const normalized = pdfPath.replace(/^\//, '');
  candidates.add(pdfPath);
  candidates.add(normalized);
  candidates.add(path.join(process.cwd(), normalized));
  candidates.add(path.join(process.cwd(), pdfPath));
  candidates.add(path.join(process.cwd(), 'public', normalized));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buffer = fs.readFileSync(candidate);
        return { buffer, fileName: path.basename(candidate) };
      }
    } catch (error) {
      console.warn('⚠️ Failed to read candidate PDF path', candidate, error);
    }
  }

  return null;
}

type ExpenseLine = QBOBill['Line'][number] & {
  __categoryHint?: {
    category: string;
  };
};

function ensureAccountLines(
  lineItems: InvoiceLineItem[] | undefined,
  totalAmount: number,
  fallbackAccount: { id: string; name: string }
): { qboLines: ExpenseLine[]; categories: Array<{ description: string; category: string }> } {
  const categories: Array<{ description: string; category: string }> = [];

  if (!lineItems || lineItems.length === 0) {
    const amount = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0;
    const description = fallbackAccount?.name || 'Invoice expense';
    categories.push({ description, category: 'dental_supplies' });
    return {
      qboLines: [
        {
          Amount: amount,
          Description: description,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: fallbackAccount.id,
              name: fallbackAccount.name,
            },
          },
        },
      ],
      categories,
    };
  }

  const qboLines = lineItems.map((item, index) => {
    const description = item.product_name || item.description || item.name || `Item ${index + 1}`;
    const amount = sanitizeAmount(
      item.line_item_total ?? item.amount ?? item.total,
      totalAmount / Math.max(lineItems.length, 1)
    );

    const category = categorizeLineItem(description, amount);
    categories.push({ description, category });

    const line: ExpenseLine = {
      LineNum: index + 1,
      Amount: amount,
      Description: description,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: fallbackAccount.id,
          name: fallbackAccount.name,
        },
      },
      __categoryHint: { category },
    };

    return line;
  });

  // Reconcile to the provided totalAmount. If line item totals do not
  // add up to the invoice total (common when shipping/tax/fees are
  // outside the parsed lines), add a single balancing line so the
  // bill Total equals the invoice total shown in PCS AI.
  try {
    const sum = qboLines.reduce((acc, l) => acc + (Number(l.Amount) || 0), 0);
    const diff = Number.isFinite(totalAmount) ? Number((totalAmount - sum).toFixed(2)) : 0;
    if (Math.abs(diff) >= 0.01) {
      const description = diff > 0 ? 'Other charges (shipping/tax/fees)' : 'Adjustment to match total';
      categories.push({ description, category: 'adjustment' });
      qboLines.push({
        LineNum: qboLines.length + 1,
        Amount: diff,
        Description: description,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: fallbackAccount.id,
            name: fallbackAccount.name,
          },
        },
        __categoryHint: { category: 'adjustment' },
      } as ExpenseLine);
    }
  } catch (_) {
    // If anything goes wrong, skip reconciliation silently.
  }

  return { qboLines, categories };
}

function applyAccountMappings(
  qboLines: ExpenseLine[],
  availableAccounts: Array<{ id: string; name: string; type: string }>,
  fallbackAccount: { id: string; name: string },
  overrideAccount?: { id: string; name: string },
  overrideClassId?: string
): QBOBill['Line'] {
  return qboLines.map((line) => {
    if (!line?.AccountBasedExpenseLineDetail) return line;

    const { __categoryHint, ...rest } = line;
    let matchedAccount = fallbackAccount;

    if (__categoryHint) {
      const target = __categoryHint.category.toLowerCase();
      matchedAccount =
        availableAccounts.find((account) => account.name.toLowerCase().includes(target)) ||
        fallbackAccount;
    }

    const finalAccount = overrideAccount || matchedAccount;

    const detail: QBOBill['Line'][number]['AccountBasedExpenseLineDetail'] = {
      ...rest.AccountBasedExpenseLineDetail,
      AccountRef: {
        value: finalAccount.id,
        name: finalAccount.name,
      },
    };

    if (overrideClassId) {
      detail.ClassRef = { value: overrideClassId };
    }

    return {
      ...rest,
      AccountBasedExpenseLineDetail: detail,
    };
  });
}

export async function createBillFromInvoice(options: BillCreationOptions): Promise<BillCreationResult> {
  const { invoiceData } = options;
  let bill: QBOBill | null = null;
  try {
    await qboClient.initialize();

    const vendorName = (options.vendorName || invoiceData.vendor || invoiceData.vendor_name || invoiceData.vendorName || '').trim();
    if (!vendorName) {
      throw new Error('Vendor name is required to create a QuickBooks bill');
    }

    const invoiceNumber = (options.invoiceNumber || invoiceData.invoice_number || invoiceData.invoiceNumber || '').toString().trim() || undefined;
    const invoiceDate = formatDate(options.invoiceDate || invoiceData.invoice_date || invoiceData.invoiceDate);
    const dueDate = formatDate(options.dueDate || invoiceData.due_date || invoiceData.dueDate);

    const totalAmount = options.totalAmount ?? sanitizeAmount(invoiceData.total ?? invoiceData.amount ?? invoiceData.totalAmount, 0);

    let lineItems = invoiceData.line_items || invoiceData.lineItems || [];
    if (!Array.isArray(lineItems)) {
      lineItems = [];
    }

    const vendor = await qboClient.ensureVendor(vendorName);
    if (!vendor?.Id) {
      throw new Error(`Unable to locate or create vendor '${vendorName}' in QuickBooks`);
    }

    const rawOfficeName =
      invoiceData.office ||
      invoiceData.office_location ||
      invoiceData.officeLocation ||
      invoiceData.location ||
      invoiceData.Office ||
      null;

    const officeName = rawOfficeName ? String(rawOfficeName).trim() : undefined;

    const expenseAccounts = await qboClient.getExpenseAccounts();
    if (!expenseAccounts || expenseAccounts.length === 0) {
      throw new Error('No expense accounts found in QuickBooks. Please set up your chart of accounts.');
    }

    const fallbackAccount = expenseAccounts[0];

    const classifyEnv = process.env.PCS_QBO_AUTO_CLASSIFY;
    const autoClassifyEnabled = classifyEnv === undefined || ['1', 'true', 'on', 'yes'].includes(classifyEnv.toLowerCase());

    let overrideAccount: { id: string; name: string; type: string } | undefined;
    let overrideClassId: string | undefined;
    let preferredAccount = fallbackAccount;
    let strategy = autoClassifyEnabled ? 'json-history' : 'disabled';
    let mappingVendor: string | undefined;
    let chosenAccountPath: string | undefined;
    let chosenClassPath: string | undefined;

    if (autoClassifyEnabled) {
      try {
        const historyMapping = await pickMappingForVendor(vendorName);
        const accountCandidates = historyMapping?.accountCandidates || [];
        const classCandidates = historyMapping?.classCandidates || [];

        if (historyMapping?.accountPath || historyMapping?.classPath) {
          mappingVendor = historyMapping.matchedVendor;
          chosenAccountPath = historyMapping.accountPath;
          let classPathToUse = historyMapping.classPath;

          if (classPathToUse && classPathToUse.trim().toLowerCase() === 'location') {
            if (officeName) {
              classPathToUse = `General-${officeName}`;
            } else {
              console.warn('[QBO][CLASSIFY] Class mapping requested location but invoice office missing', {
                vendor: vendorName,
                invoiceNumber,
              });
              classPathToUse = undefined;
            }
          }

          chosenClassPath = classPathToUse;

          let resolvedAccount: any = undefined;
          let selectedAccountPath: string | undefined;
          for (const candidate of accountCandidates) {
            if (!candidate) continue;
            if (!isValidAccountPath(candidate)) {
              continue;
            }
            const lookup = await resolveAccountByFullName(candidate);
            if (!lookup) {
              continue;
            }
            resolvedAccount = lookup;
            selectedAccountPath = candidate;
            break;
          }

          if (!resolvedAccount && historyMapping.accountPath && isValidAccountPath(historyMapping.accountPath)) {
            resolvedAccount = await resolveAccountByFullName(historyMapping.accountPath);
            selectedAccountPath = historyMapping.accountPath;
          }

          if (historyMapping.accountPath && !selectedAccountPath) {
            console.warn('[QBO][CLASSIFY] Account path not in chart of accounts list', {
              vendor: vendorName,
              accountPath: historyMapping.accountPath,
            });
          }

          const resolvedClass = classPathToUse ? await resolveClassByFullName(classPathToUse) : undefined;

          if (resolvedAccount) {
            overrideAccount = {
              id: resolvedAccount.id,
              name: resolvedAccount.fullName,
              type: resolvedAccount.type || 'Expense',
            };
            preferredAccount = overrideAccount;
            chosenAccountPath = selectedAccountPath || chosenAccountPath;
          } else if (selectedAccountPath) {
            console.warn('[QBO][CLASSIFY] Account path could not be resolved', {
              vendor: vendorName,
              accountPath: selectedAccountPath,
            });
          }

          if (resolvedClass) {
            overrideClassId = resolvedClass.id;
          } else if (classPathToUse) {
            console.warn('[QBO][CLASSIFY] Class path could not be resolved', {
              vendor: vendorName,
              classPath: classPathToUse,
            });
          }
        } else {
          strategy = 'history-missing';
        }
      } catch (error) {
        strategy = 'history-error';
        console.warn('[QBO][CLASSIFY] Failed to load vendor history mapping', { vendor: vendorName, error });
      }
    }

    let locationId: string | undefined;
    if (officeName) {
      const resolvedLocation = await resolveLocationByName(officeName);
      if (resolvedLocation) {
        locationId = resolvedLocation.id;
      } else {
        console.warn('[QBO][CLASSIFY] Location not found in QuickBooks', {
          vendor: vendorName,
          office: officeName,
        });
      }
    }

    const { qboLines: initialLines, categories } = ensureAccountLines(lineItems, totalAmount, {
      id: preferredAccount.id,
      name: preferredAccount.name,
    });
    const qboLines = applyAccountMappings(initialLines, expenseAccounts, preferredAccount, overrideAccount, overrideClassId);

    console.log('[QBO][CLASSIFY]', {
      vendor: vendorName,
      strategy,
      mappingVendor: mappingVendor || null,
      chosenAccount: chosenAccountPath || null,
      chosenClass: chosenClassPath || null,
      resolvedAccountId: overrideAccount?.id || preferredAccount?.id,
      resolvedClassId: overrideClassId || null,
      locationName: officeName || null,
      resolvedLocationId: locationId || null,
      dryRun: !!options.dryRun,
    });

    const memoText = 'PCS AI Approved Invoice';

    bill = {
      DocNumber: invoiceNumber,
      TxnDate: invoiceDate || formatDate(new Date().toISOString())!,
      DueDate: dueDate,
      VendorRef: {
        value: vendor.Id,
        name: vendor.DisplayName || vendorName
      },
      Line: qboLines,
      Memo: memoText,
      PrivateNote: memoText,
    };

    if (locationId) {
      bill.DepartmentRef = { value: locationId };
    }

    console.log('[QBO][CREATE_BILL] payload preview', {
      vendor: vendorName,
      invoiceNumber,
      lineCount: bill.Line.length,
      accountsUsed: bill.Line.map((line) => line.AccountBasedExpenseLineDetail?.AccountRef?.value),
      totalAmount,
    });

    if (options.dryRun) {
      console.log('[QBO][DRY_RUN] QuickBooks bill payload', {
        vendor: vendorName,
        invoiceNumber,
        lines: bill.Line.length,
        accounts: bill.Line.map((line) => line.AccountBasedExpenseLineDetail?.AccountRef?.value),
        classRefs: bill.Line.map((line) => line.AccountBasedExpenseLineDetail?.ClassRef?.value || null),
      });

      return {
        success: true,
        billId: undefined,
        pdfAttached: false,
        categories,
      };
    }

    const apAccount = await qboClient.getAccountsPayableAccount();
    if (apAccount?.Id && bill) {
      bill.APAccountRef = {
        value: apAccount.Id,
        name: apAccount.Name
      };
    }

    const createdBill = await qboClient.createBill(bill);
    if (!createdBill?.Id) {
      throw new Error('QuickBooks did not return a bill identifier');
    }

    let pdfAttached = false;
    const pdfPath = options.pdfPath || invoiceData.pdf_path || invoiceData.pdfPath;
    const pdfFile = resolvePdfFile(pdfPath);
    if (pdfFile) {
      try {
        await qboClient.uploadAttachment(createdBill.Id, pdfFile.fileName, pdfFile.buffer, 'application/pdf');
        pdfAttached = true;
      } catch (attachmentError) {
        console.warn('⚠️ Failed to attach PDF to QuickBooks bill:', attachmentError);
      }
    } else if (pdfPath) {
      console.warn('⚠️ PDF file not found at provided path:', pdfPath);
    }

    return {
      success: true,
      billId: createdBill.Id,
      pdfAttached,
      categories
    };
  } catch (error: any) {
    console.error('❌ createBillFromInvoice failed:', error?.response?.status, error?.response?.statusText);
    console.error('❌ createBillFromInvoice payload:', JSON.stringify({
      vendor: options.vendorName || invoiceData.vendor || invoiceData.vendor_name,
      invoiceNumber: options.invoiceNumber || invoiceData.invoice_number || invoiceData.invoiceNumber,
      billPreview: bill,
    }, null, 2));
    if (error?.Fault) {
      console.error('❌ QBO Fault detail:', JSON.stringify(error.Fault, null, 2));
    }
    return {
      success: false,
      error: error?.message || 'Failed to create QuickBooks bill'
    };
  }
}
