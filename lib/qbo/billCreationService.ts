import fs from 'fs';
import path from 'path';
import { qboClient, QBOBill, QBOItem } from './qboClient';

type LineWithHint = QBOBill['Line'][number] & {
  __categoryHint?: {
    category: string;
    qboItemName: string;
  };
};

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

function mapToQBOItem(category: string): string {
  const categoryMap: Record<string, string> = {
    supplies: 'Dental Supplies',
    dental_supplies: 'Dental Supplies',
    instruments: 'Dental Instruments',
    disposables: 'Disposable Items',
    equipment: 'Dental Equipment',
    xray_equipment: 'X-Ray Equipment',
    dental_chairs: 'Dental Chairs',
    lab_work: 'Lab Work',
    crowns: 'Crowns',
    bridges: 'Bridges',
    dentures: 'Dentures',
    cleaning: 'Cleaning Services',
    filling: 'Filling Materials',
    extraction: 'Extraction Services',
    orthodontic: 'Orthodontic Services',
    anesthesia: 'Anesthesia',
    medication: 'Medications'
  };

  return categoryMap[category] || 'Dental Supplies';
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

function ensureLineItems(
  lineItems: InvoiceLineItem[] | undefined,
  totalAmount: number,
  fallbackItem: QBOItem
): { qboLines: LineWithHint[]; categories: Array<{ description: string; category: string }> } {
  const categories: Array<{ description: string; category: string }> = [];

  if (!lineItems || lineItems.length === 0) {
    const amount = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0;
    const description = fallbackItem?.Name || 'Dental Supplies';
    categories.push({ description, category: 'dental_supplies' });
    return {
      qboLines: [
        {
          Id: '1',
          LineNum: 1,
          Amount: amount,
          Description: description,
          DetailType: 'ItemBasedExpenseLineDetail',
          ItemBasedExpenseLineDetail: {
            ItemRef: {
              value: fallbackItem?.Id || '1',
              name: fallbackItem?.Name || 'Dental Supplies'
            },
            Qty: 1,
            UnitPrice: amount
          }
        }
      ],
      categories
    };
  }

  const qboLines = lineItems.map((item, index) => {
    const description = item.product_name || item.description || item.name || `Item ${index + 1}`;
    const amount = sanitizeAmount(item.line_item_total ?? item.amount ?? item.total, totalAmount / Math.max(lineItems.length, 1));
    const quantityRaw = item.Quantity ?? item.quantity;
    const quantity = sanitizeAmount(quantityRaw, 1) || 1;
    let unitPrice = sanitizeAmount(item.unit_price ?? item.UnitPrice, amount / (quantity || 1));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      unitPrice = quantity ? amount / quantity : amount;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      unitPrice = amount;
    }

    const category = categorizeLineItem(description, amount);
    const qboItemName = mapToQBOItem(category);

    categories.push({ description, category });

    const line: LineWithHint = {
      Id: (index + 1).toString(),
      LineNum: index + 1,
      Amount: amount,
      Description: description,
      DetailType: 'ItemBasedExpenseLineDetail',
      ItemBasedExpenseLineDetail: {
        ItemRef: {
          value: fallbackItem.Id,
          name: fallbackItem.Name
        },
        Qty: quantity,
        UnitPrice: unitPrice
      },
      __categoryHint: { category, qboItemName }
    };

    return line;
  });

  return { qboLines, categories };
}

function applyItemMappings(
  qboLines: LineWithHint[],
  availableItems: QBOItem[],
  fallbackItem: QBOItem
): QBOBill['Line'] {
  return qboLines.map((line) => {
    if (!line?.ItemBasedExpenseLineDetail) return line;

    const { __categoryHint, ...rest } = line;
    const fallback = fallbackItem;
    let matchedItem = fallback;

    if (__categoryHint) {
      const targetName = __categoryHint.qboItemName.toLowerCase();
      matchedItem =
        availableItems.find(
          (item) =>
            item.Name.toLowerCase().includes(targetName) && item?.ExpenseAccountRef?.value
        ) ||
        availableItems.find(
          (item) =>
            item.Name.toLowerCase().includes(__categoryHint.category.toLowerCase()) &&
            item?.ExpenseAccountRef?.value
        ) ||
        fallback;
    }

    if (!matchedItem?.ExpenseAccountRef?.value) {
      matchedItem = fallback;
    }

    return {
      ...rest,
      ItemBasedExpenseLineDetail: {
        ...rest.ItemBasedExpenseLineDetail,
        ItemRef: {
          value: matchedItem?.Id || rest.ItemBasedExpenseLineDetail.ItemRef.value,
          name: matchedItem?.Name || rest.ItemBasedExpenseLineDetail.ItemRef.name
        }
      }
    };
  });
}

export async function createBillFromInvoice(options: BillCreationOptions): Promise<BillCreationResult> {
  const { invoiceData } = options;

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

    let availableItems = await qboClient.getDentalItems();
    if (!availableItems || availableItems.length === 0) {
      availableItems = await qboClient.getItems();
    }
    if (!availableItems || availableItems.length === 0) {
      throw new Error('No QuickBooks items available for mapping. Please ensure items exist in QuickBooks.');
    }

    const defaultItem =
      availableItems.find((item) => item?.ExpenseAccountRef?.value) || availableItems[0];

    if (!defaultItem?.ExpenseAccountRef?.value) {
      throw new Error(
        'QuickBooks items do not have expense accounts configured. Edit an item in QuickBooks, enable "I purchase this product/service" and assign an expense account.'
      );
    }

    const { qboLines: initialLines, categories } = ensureLineItems(lineItems, totalAmount, defaultItem);
    const qboLines = applyItemMappings(initialLines, availableItems, defaultItem);

    const bill: QBOBill = {
      DocNumber: invoiceNumber,
      TxnDate: invoiceDate || formatDate(new Date().toISOString())!,
      DueDate: dueDate,
      VendorRef: {
        value: vendor.Id,
        name: vendor.DisplayName || vendorName
      },
      Line: qboLines,
      Memo: `PCS AI Approved Invoice - ${vendorName}${invoiceNumber ? ` - ${invoiceNumber}` : ''}`
    };

    const apAccount = await qboClient.getAccountsPayableAccount();
    if (apAccount?.Id) {
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
    console.error('❌ createBillFromInvoice failed:', error);
    return {
      success: false,
      error: error?.message || 'Failed to create QuickBooks bill'
    };
  }
}
