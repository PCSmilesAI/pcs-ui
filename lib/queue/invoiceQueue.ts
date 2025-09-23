import fs from 'fs';
import path from 'path';

export type InvoiceRecord = Record<string, any>;

export type QueueFile = {
  filePath: string;
  invoices: InvoiceRecord[];
  format: 'array' | 'object';
};

export const INVOICE_QUEUE_PATHS = [
  path.join(process.cwd(), 'pcs_ai_data', 'invoice_queue.json'),
  path.join(process.cwd(), 'invoice_queue.json'),
  path.join(process.cwd(), 'public', 'invoice_queue.json'),
];

const TIMESTAMP_FIELDS = [
  'timestamp',
  'updated_at',
  'updatedAt',
  'processed_at',
  'processedAt',
  'created_at',
  'createdAt',
  'created',
  'received_at',
  'receivedAt',
];

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function extractTimestamp(invoice: InvoiceRecord): number {
  let max = 0;
  for (const field of TIMESTAMP_FIELDS) {
    if (field in invoice) {
      const ts = parseTimestamp(invoice[field]);
      if (ts > max) {
        max = ts;
      }
    }
  }
  return max;
}

function isApproved(invoice: InvoiceRecord): boolean {
  if (invoice.approved === true) return true;
  const status = (invoice.status || invoice.State || invoice.state || '').toString().toLowerCase();
  return status === 'approved' || status === 'completed';
}

function invoiceKey(invoice: InvoiceRecord): string | null {
  const invoiceNumber = invoice.invoice_number ?? invoice.invoiceNumber;
  if (invoiceNumber && String(invoiceNumber).trim().length > 0) {
    return String(invoiceNumber).trim().toLowerCase();
  }
  const id = invoice.id ?? invoice.ID ?? invoice.Id;
  if (id && String(id).trim().length > 0) {
    return String(id).trim().toLowerCase();
  }
  return null;
}

export function dedupeInvoices(invoices: InvoiceRecord[]): {
  invoices: InvoiceRecord[];
  duplicatesRemoved: number;
} {
  const result: InvoiceRecord[] = [];
  const indexMap = new Map<string, number>();
  let duplicatesRemoved = 0;

  invoices.forEach((invoice) => {
    const key = invoiceKey(invoice);
    if (!key) {
      result.push(invoice);
      return;
    }

    const normalisedKey = key;
    const existingIndex = indexMap.get(normalisedKey);
    const candidateTimestamp = extractTimestamp(invoice);
    const candidateApproved = isApproved(invoice);

    if (existingIndex === undefined) {
      indexMap.set(normalisedKey, result.length);
      result.push(invoice);
      return;
    }

    duplicatesRemoved += 1;
    const existingInvoice = result[existingIndex];
    const existingTimestamp = extractTimestamp(existingInvoice);
    const existingApproved = isApproved(existingInvoice);

    let replace = false;
    if (candidateApproved && !existingApproved) {
      replace = true;
    } else if (candidateTimestamp > existingTimestamp) {
      replace = true;
    } else if (candidateTimestamp === existingTimestamp && candidateApproved === existingApproved) {
      replace = true;
    }

    if (replace) {
      result[existingIndex] = { ...existingInvoice, ...invoice };
    }
  });

  return {
    invoices: result,
    duplicatesRemoved,
  };
}

export function loadQueueFile(filePath: string): QueueFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return {
      filePath,
      invoices: parsed,
      format: 'array',
    };
  }

  if (parsed && Array.isArray(parsed.invoices)) {
    return {
      filePath,
      invoices: parsed.invoices,
      format: 'object',
    };
  }

  return {
    filePath,
    invoices: [],
    format: 'object',
  };
}

export function writeQueueFile(
  filePath: string,
  invoices: InvoiceRecord[],
  format: QueueFile['format']
): void {
  const payload = format === 'array' ? invoices : { invoices };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

export function getExistingQueueFiles(): QueueFile[] {
  const files: QueueFile[] = [];
  for (const candidate of INVOICE_QUEUE_PATHS) {
    if (fs.existsSync(candidate)) {
      try {
        files.push(loadQueueFile(candidate));
      } catch (error) {
        console.warn('[QUEUE] Failed to load queue file:', candidate, error);
      }
    }
  }
  return files;
}

export function saveQueueFiles(files: QueueFile[], invoices: InvoiceRecord[]): void {
  for (const file of files) {
    writeQueueFile(file.filePath, invoices, file.format);
  }
}

export function updateInvoiceInList(
  invoices: InvoiceRecord[],
  invoiceNumber: string,
  updater: (invoice: InvoiceRecord) => InvoiceRecord | null
): { updated: boolean; invoices: InvoiceRecord[] } {
  let updated = false;
  const targetKey = invoiceNumber.trim().toLowerCase();
  const next = invoices.map((invoice) => {
    const key = invoiceKey(invoice);
    if (!key) return invoice;
    if (key === targetKey) {
      const result = updater(invoice);
      if (result) {
        updated = true;
        return result;
      }
      updated = true;
      return invoice;
    }
    return invoice;
  });
  return { updated, invoices: next };
}
