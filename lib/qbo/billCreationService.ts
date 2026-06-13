import fs from 'fs';
import path from 'path';
import { qboClient, QBOBill } from './qboClient';
import { pickMappingForVendor } from './vendorMappings';
import { resolveAccountByFullName, resolveClassByFullName, resolveLocationByName } from './qboLookup';
import { isValidAccountPath } from './chartOfAccounts';
import { isPathWithinBase } from '../security/path-validation';
import { getInvoiceCategories } from '../invoices/categoryParser';

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
  invoiceId?: string; // Database invoice ID for looking up invoice-level categories
}

export interface BillCreationResult {
  success: boolean;
  billId?: string;
  pdfAttached?: boolean;
  categories?: Array<{ description: string; category: string; className?: string | null; flaggedForReview?: boolean }>;
  // Dry-run preview fields (only populated when options.dryRun === true)
  lineCount?: number;
  vendor?: string;
  accounts?: Array<string | null>;
  classRefs?: Array<string | null>;
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

function toGeneralClassForOffice(office?: string): string | undefined {
  if (!office) return undefined;
  const raw = String(office).trim();
  if (!raw) return undefined;
  // Normalization: collapse spaces, title-case words
  const normalized = raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // PCS-specific correction: Milwaukee -> Milwaukie
    .replace(/\bmilwaukee\b/g, 'milwaukie')
    .replace(/\bgp\b/g, 'grants pass');
  const title = normalized.replace(/\b\w/g, (c) => c.toUpperCase());
  const trimmed = title.replace(/^General[-\s]*/i, '');
  return `General-${trimmed}`;
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

  const baseDir = process.cwd();
  const candidates = new Set<string>();
  
  // Handle /api/pdf/ paths - extract filename and look in known directories
  if (pdfPath.startsWith('/api/pdf/')) {
    const fileName = pdfPath.replace('/api/pdf/', '');
    // Add common PDF storage locations
    candidates.add(path.join(baseDir, 'pcs_ui_data', 'email_invoices', fileName));
    candidates.add(path.join(baseDir, 'email_invoices', fileName));
    candidates.add(path.join(baseDir, 'public', 'email_invoices', fileName));
    candidates.add(path.join(baseDir, 'sample_invoices_pcs', fileName));
  } else {
    // SECURITY: Validate path to prevent path traversal attacks for non-API paths
    if (!isPathWithinBase(pdfPath, baseDir)) {
      console.error('❌ Path traversal attempt detected in PDF path:', pdfPath);
      return null;
    }
    
    const normalized = pdfPath.replace(/^\//, '');
    candidates.add(pdfPath);
    candidates.add(normalized);
    candidates.add(path.join(baseDir, normalized));
    candidates.add(path.join(baseDir, pdfPath));
    candidates.add(path.join(baseDir, 'public', normalized));
    // Also check email_invoices directories
    const fileName = path.basename(pdfPath);
    candidates.add(path.join(baseDir, 'pcs_ui_data', 'email_invoices', fileName));
    candidates.add(path.join(baseDir, 'email_invoices', fileName));
  }

  for (const candidate of candidates) {
    try {
      // SECURITY: Validate each candidate path before accessing
      if (!isPathWithinBase(candidate, baseDir)) {
        console.warn('⚠️ Candidate path outside base directory:', candidate);
        continue;
      }

      // SECURITY: candidate path is constructed from validated invoice data - safe to use
      // lgtm[js/path-injection] - Path validated with isPathWithinBase
      if (fs.existsSync(candidate)) {
        // SECURITY: candidate path validated above - safe to use
        // lgtm[js/path-injection] - Path validated with isPathWithinBase
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
  /** Set on invoice GL lines so vendor overrideAccount does not replace resolveAccountByFullName results */
  __preserveResolvedAccount?: boolean;
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
          __categoryHint: { category: 'dental_supplies' },
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

  // Reconcile to the provided totalAmount. Small diffs (shipping/tax/fees
  // not parsed as lines) get a balancing line. Large discrepancies (>10%
  // of total or >$50) indicate a data problem and throw to block bill creation.
  try {
    const sum = qboLines.reduce((acc, l) => acc + (Number(l.Amount) || 0), 0);
    const diff = Number.isFinite(totalAmount) ? Number((totalAmount - sum).toFixed(2)) : 0;
    if (Math.abs(diff) >= 0.01) {
      const pctDiff = totalAmount > 0 ? Math.abs(diff) / totalAmount : 1;
      if (Math.abs(diff) > 50 || pctDiff > 0.10) {
        throw new Error(
          `Line items ($${sum.toFixed(2)}) differ from invoice total ($${totalAmount.toFixed(2)}) ` +
          `by $${Math.abs(diff).toFixed(2)} (${(pctDiff * 100).toFixed(1)}%). Needs manual review.`
        );
      }
      const description = diff > 0 ? 'Other charges (shipping/tax/fees)' : 'Adjustment to match total';
      console.warn('[QBO][BILL_LINES]', 'auto_balance_applied', { diff, sum, totalAmount });
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
  } catch (balanceErr: any) {
    if (balanceErr?.message?.includes('Needs manual review')) throw balanceErr;
  }

  return { qboLines, categories };
}

/**
 * NEW: Create bill lines from invoice-level categories
 * If invoice has categories, create one line per category with the full invoice total
 * If single category, create one line with full amount
 * If multiple categories, split amount equally among categories
 */
function createCategoryBasedLines(
  categories: Array<{ id: string; name: string }>,
  totalAmount: number,
  fallbackAccount: { id: string; name: string }
): ExpenseLine[] {
  if (!categories || categories.length === 0) {
    // No categories - create single line with full amount
    return [{
      Description: 'Invoice',
      Amount: totalAmount,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: fallbackAccount.id,
          name: fallbackAccount.name,
        },
      },
    }];
  }

  if (categories.length === 1) {
    // Single category - create one line with full amount
    return [{
      Description: `${categories[0].name}`,
      Amount: totalAmount,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: fallbackAccount.id,
          name: fallbackAccount.name,
        },
      },
      __categoryHint: { category: categories[0].name },
    }];
  }

  // Multiple categories - split amount equally using integer cents to avoid float drift
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / categories.length);
  const remainder = totalCents - (baseCents * categories.length);

  return categories.map((cat, idx) => {
    const lineCents = baseCents + (idx < remainder ? 1 : 0);
    return {
      Description: `${cat.name}`,
      Amount: lineCents / 100,
      DetailType: 'AccountBasedExpenseLineDetail' as const,
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: fallbackAccount.id,
          name: fallbackAccount.name,
        },
      },
      __categoryHint: { category: cat.name },
    };
  });
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

    const { __categoryHint, __preserveResolvedAccount, ...rest } = line;

    // Invoice GL lines: keep resolveAccountByFullName per-line AccountRef; vendor override must not flatten to COGS
    if (
      __preserveResolvedAccount &&
      rest.AccountBasedExpenseLineDetail?.AccountRef?.value
    ) {
      const detail: QBOBill['Line'][number]['AccountBasedExpenseLineDetail'] = {
        ...rest.AccountBasedExpenseLineDetail,
        AccountRef: {
          value: rest.AccountBasedExpenseLineDetail.AccountRef.value,
          name: rest.AccountBasedExpenseLineDetail.AccountRef.name || '',
        },
      };
      if (
        !detail.ClassRef &&
        overrideClassId &&
        /^\d+$/.test(overrideClassId)
      ) {
        detail.ClassRef = { value: overrideClassId };
      }
      return {
        ...rest,
        AccountBasedExpenseLineDetail: detail,
      };
    }

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

    // Only use classId if it's a valid numeric QBO ID (not a hardcoded string like "general-eugene")
    if (overrideClassId && /^\d+$/.test(overrideClassId)) {
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
  // Extract invoiceId from options or invoiceData if not explicitly provided
  const invoiceId = options.invoiceId || invoiceData.id || invoiceData.invoice_id || null;
  let bill: QBOBill | null = null;
  try {
    await qboClient.initialize();

    const vendorName = (options.vendorName || invoiceData.vendor || invoiceData.vendor_name || invoiceData.vendorName || '').trim();
    if (!vendorName) {
      throw new Error('Vendor name is required to create a QuickBooks bill');
    }

    // QBO DocNumber has a max length of 21 characters
    const rawInvoiceNumber = (options.invoiceNumber || invoiceData.invoice_number || invoiceData.invoiceNumber || '').toString().trim();
    const invoiceNumber = rawInvoiceNumber ? rawInvoiceNumber.slice(0, 21) : undefined;
    if (rawInvoiceNumber && rawInvoiceNumber.length > 21) {
      console.warn(`[QBO][CREATE_BILL] Invoice number truncated from ${rawInvoiceNumber.length} to 21 chars: "${rawInvoiceNumber}" -> "${invoiceNumber}"`);
    }
    const invoiceDate = formatDate(options.invoiceDate || invoiceData.invoice_date || invoiceData.invoiceDate);
    const dueDate = formatDate(options.dueDate || invoiceData.due_date || invoiceData.dueDate);

    let totalAmount = options.totalAmount ?? sanitizeAmount(invoiceData.total ?? invoiceData.amount ?? invoiceData.totalAmount, 0);

    // If totalAmount is 0 and we have an invoiceId, try to fetch from database
    if (totalAmount === 0 && options.invoiceId) {
      try {
        const { getDatabase } = await import('../db/client');
        const db = getDatabase();
        const row = db.prepare('SELECT amount_cents FROM invoices WHERE id = ?').get(options.invoiceId) as { amount_cents: number } | undefined;
        if (row && row.amount_cents > 0) {
          totalAmount = row.amount_cents / 100;
          console.log('[QBO][CREATE_BILL] Fetched amount from database:', { invoiceId: options.invoiceId, totalAmount });
        }
      } catch (err) {
        console.warn('[QBO][CREATE_BILL] Could not fetch amount from database:', err);
      }
    }

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
              classPathToUse = toGeneralClassForOffice(officeName);
            } else {
              // Invoice office not set - will use default class assignment
              console.log('[QBO][CLASSIFY] Using default class (invoice office not set)', {
                vendor: vendorName,
                invoiceNumber,
              });
              classPathToUse = undefined;
            }
          }

          // Prefer a General-<Office> class from the vendor's class candidates when available.
          // This complements the explicit 'location' directive above and helps when JSON lists
          // multiple General-* options (e.g., different offices) without using the 'location' keyword.
          if (!classPathToUse && Array.isArray(classCandidates) && classCandidates.length > 0 && officeName) {
            const desired = toGeneralClassForOffice(officeName);
            const desiredKey = (desired || '').replace(/\s+/g, '').toLowerCase();
            const match = classCandidates.find((c) =>
              typeof c === 'string' && c.replace(/\s+/g, '').toLowerCase() === desiredKey
            );
            if (match) {
              classPathToUse = match;
              console.log('[QBO][CLASSIFY] Selected office-matching class from candidates', {
                vendor: vendorName,
                office: officeName,
                classSelected: classPathToUse,
              });
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
            // Account from history not found in chart - will use default account instead
            console.log('[QBO][CLASSIFY] Using default account (history account not in chart)', {
              vendor: vendorName,
              historyAccount: historyMapping.accountPath,
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
            // Account path from vendor mapping not in QBO - will use default account
            console.log('[QBO][CLASSIFY] Using default account (mapped account not found in QBO)', {
              vendor: vendorName,
              accountPath: selectedAccountPath,
            });
          }

          if (resolvedClass && resolvedClass.id && /^\d+$/.test(resolvedClass.id)) {
            overrideClassId = resolvedClass.id;
          } else if (resolvedClass) {
            console.warn('[QBO][CLASSIFY] Resolved class has invalid ID (not numeric), skipping:', {
              vendor: vendorName,
              classPath: classPathToUse,
              resolvedId: resolvedClass.id,
            });
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

    // Check for invoice-level categories first (Phase 2: Invoice-level categorization)
    let qboLines: ExpenseLine[];
    let categories: Array<{ description: string; category: string; className?: string | null; flaggedForReview?: boolean }> = [];
    
    if (options.invoiceId) {
      try {
        const invoiceCategories = await import('../invoices/categoryParser').then(m => m.getInvoiceCategories(options.invoiceId!));
        
        if (invoiceCategories && invoiceCategories.length > 0) {
          // Use invoice-level GL lines with actual amounts (Stampli-style GL line splitting)
          console.log('[QBO][CREATE_BILL] Using GL line splitting', {
            invoiceId: options.invoiceId,
            lineCount: invoiceCategories.length,
            categories: invoiceCategories.map(c => ({
              name: c.categoryName,
              amount: c.amountCents ? c.amountCents / 100 : null,
              class: c.className || c.classId,
            })),
          });

          // Build QBO Bill lines from GL lines, using actual amounts
          qboLines = [];
          categories = [];
          
          for (const cat of invoiceCategories) {
            // Resolve account name to QBO account ID
            const resolvedAccount = await resolveAccountByFullName(cat.categoryName);
            // Resolve class from classId or className
            let resolvedClass = cat.classId ? await resolveClassByFullName(cat.classId) : undefined;
            if (!resolvedClass && cat.className) {
              resolvedClass = await resolveClassByFullName(cat.className);
            }
            
            // Use actual amount from GL line, or fallback to proportional split (cents-safe)
            const lineAmount = cat.amountCents 
              ? cat.amountCents / 100 
              : Math.round((totalAmount * 100) / invoiceCategories.length) / 100;
            
            // Use description from GL line, fallback to category name
            const lineDescription = cat.description || cat.categoryName || '';
            
            if (resolvedAccount?.type === 'Cost of Goods Sold') {
              console.warn('[QBO][CREATE_BILL] GL category_name resolved to COGS in QBO — use Expense account path (e.g. 52210 Dental Lab Fees)', {
                categoryName: cat.categoryName,
                vendor: vendorName,
              });
            }

            const accountId = resolvedAccount?.id || preferredAccount.id;
            const accountName = resolvedAccount?.name || preferredAccount.name;
            const rawClassId = resolvedClass?.id || overrideClassId;
            // Only use classId if it's a valid numeric QBO ID (not a hardcoded string like "general-eugene")
            const classId = rawClassId && /^\d+$/.test(rawClassId) ? rawClassId : undefined;
            
            if (rawClassId && !classId) {
              console.warn('[QBO][CREATE_BILL] Skipping invalid class ID (not numeric):', rawClassId);
            }
            
            qboLines.push({
              Description: lineDescription,
              Amount: lineAmount,
              DetailType: 'AccountBasedExpenseLineDetail',
              AccountBasedExpenseLineDetail: {
                AccountRef: {
                  value: accountId,
                  name: accountName,
                },
                ...(classId ? { ClassRef: { value: classId } } : {}),
              },
              __preserveResolvedAccount: true,
            });
            
            categories.push({
              description: lineDescription,
              category: cat.categoryName,
              className: cat.className || null,
              flaggedForReview: cat.flaggedForReview,
            });
          }

          // Apply any account mappings
          qboLines = applyAccountMappings(qboLines, expenseAccounts, preferredAccount, overrideAccount, overrideClassId);
          
          console.log('[QBO][CREATE_BILL] GL lines built', {
            invoiceId: options.invoiceId,
            lineCount: qboLines.length,
            totalLineAmount: qboLines.reduce((sum, l) => sum + l.Amount, 0),
            invoiceTotal: totalAmount,
          });
        } else {
          // No invoice-level categories - use line-item based approach
          const { qboLines: initialLines, categories: lineCategories } = ensureAccountLines(lineItems, totalAmount, {
            id: preferredAccount.id,
            name: preferredAccount.name,
          });
          qboLines = applyAccountMappings(initialLines, expenseAccounts, preferredAccount, overrideAccount, overrideClassId);
          categories = lineCategories;
        }
      } catch (error) {
        console.warn('[QBO][CREATE_BILL] Failed to load invoice-level categories, falling back to line-item approach', error);
        // Fallback to line-item based approach
        const { qboLines: initialLines, categories: lineCategories } = ensureAccountLines(lineItems, totalAmount, {
          id: preferredAccount.id,
          name: preferredAccount.name,
        });
        qboLines = applyAccountMappings(initialLines, expenseAccounts, preferredAccount, overrideAccount, overrideClassId);
        categories = lineCategories;
      }
    } else {
      // No invoiceId provided - use line-item based approach
      const { qboLines: initialLines, categories: lineCategories } = ensureAccountLines(lineItems, totalAmount, {
        id: preferredAccount.id,
        name: preferredAccount.name,
      });
      qboLines = applyAccountMappings(initialLines, expenseAccounts, preferredAccount, overrideAccount, overrideClassId);
      categories = lineCategories;
    }

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

    const memoText = `Bill Generated by PCS AI | Invoice: ${invoiceNumber} | Vendor: ${vendorName}`;

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
      const accounts = bill.Line.map((line) => line.AccountBasedExpenseLineDetail?.AccountRef?.value || null);
      const classRefs = bill.Line.map((line) => line.AccountBasedExpenseLineDetail?.ClassRef?.value || null);

      console.log('[QBO][BUILD][DRYRUN]', {
        vendor: vendorName,
        invoiceNumber,
        lines: bill.Line.length,
        accounts,
        classRefs,
      });

      return {
        success: true,
        billId: undefined,
        pdfAttached: false,
        categories,
        lineCount: bill.Line.length,
        vendor: vendorName,
        accounts,
        classRefs,
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
    console.log('[QBO][PDF_ATTACH] Attempting PDF attachment:', {
      billId: createdBill.Id,
      pdfPath: pdfPath || 'none provided',
      hasPdfPath: !!pdfPath,
    });
    
    const pdfFile = resolvePdfFile(pdfPath);
    if (pdfFile) {
      try {
        console.log('[QBO][PDF_ATTACH] Found PDF file:', {
          fileName: pdfFile.fileName,
          size: pdfFile.buffer.length,
        });
        await qboClient.uploadAttachment(createdBill.Id, pdfFile.fileName, pdfFile.buffer, 'application/pdf');
        pdfAttached = true;
        console.log('[QBO][PDF_ATTACH] ✅ PDF attached successfully to bill:', createdBill.Id);
      } catch (attachmentError: any) {
        console.error('[QBO][PDF_ATTACH] ❌ Failed to attach PDF:', {
          billId: createdBill.Id,
          error: attachmentError?.message || attachmentError,
        });
      }
    } else if (pdfPath) {
      console.warn('[QBO][PDF_ATTACH] ⚠️ PDF file not found at path:', pdfPath);
    } else {
      console.log('[QBO][PDF_ATTACH] No PDF path provided for bill:', createdBill.Id);
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

// Export the new category-based line creation function for use in other modules
export { createCategoryBasedLines };
