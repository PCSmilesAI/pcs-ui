import fs from 'fs/promises';
import path from 'path';
import { InvoiceApprovals, InvoiceStatus } from './types';
import { resolveDataPath } from './dataDir';

export type InvoiceRecord = Record<string, any>;

const SEED_PATHS = [
  path.join(process.cwd(), 'public', 'invoice_queue.json'),
  path.join(process.cwd(), 'invoice_queue.json'),
];

function getStorePath(): string {
  return resolveDataPath('invoice_queue.json');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function atomicWrite(filePath: string, data: any) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, filePath);
}

async function trySeed(targetPath: string) {
  for (const seed of SEED_PATHS) {
    try {
      const buf = await fs.readFile(seed, 'utf8');
      const parsed = JSON.parse(buf);
      await atomicWrite(targetPath, parsed);
      console.warn('[WORKFLOW][STORE] seeded invoice store from', seed);
      return;
    } catch (_) {
      // try next seed
    }
  }
  await atomicWrite(targetPath, { invoices: [] });
}

let backfillPromise: Promise<void> | null = null;

async function backfillIfNeeded() {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      const file = getStorePath();
      try {
        await fs.access(file);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          await trySeed(file);
        } else {
          throw err;
        }
      }

      const buf = await fs.readFile(file, 'utf8');
      let store: any;
      try {
        store = JSON.parse(buf);
      } catch {
        store = { invoices: [] };
      }

      const invoices: InvoiceRecord[] = Array.isArray(store) ? store : Array.isArray(store.invoices) ? store.invoices : [];
      let addedStatus = 0;
      let addedApprovals = 0;

      invoices.forEach((invoice) => {
        if (invoice.status === undefined || invoice.status === null || invoice.status === '') {
          invoice.status = 'incoming';
          addedStatus += 1;
        }
        if (!invoice.approvals || typeof invoice.approvals !== 'object') {
          invoice.approvals = {} as InvoiceApprovals;
          addedApprovals += 1;
        }
      });

      if (addedStatus > 0 || addedApprovals > 0) {
        await atomicWrite(file, Array.isArray(store) ? invoices : { ...store, invoices });
      }
      console.log(`[WORKFLOW][BACKFILL] addedStatus:${addedStatus} addedApprovals:${addedApprovals}`);
    })();
  }
  return backfillPromise;
}

async function loadStore(): Promise<{ invoices: InvoiceRecord[] }> {
  await backfillIfNeeded();
  const file = getStorePath();
  const buf = await fs.readFile(file, 'utf8');
  let parsed: any;
  try {
    parsed = JSON.parse(buf);
  } catch {
    parsed = { invoices: [] };
  }
  let result: { invoices: InvoiceRecord[] };
  if (Array.isArray(parsed)) {
    result = { invoices: parsed };
  } else {
    if (!Array.isArray(parsed.invoices)) {
      parsed.invoices = [];
    }
    result = parsed;
  }
  console.log('[WORKFLOW][STORE]', 'loadStore', { invoiceCount: result.invoices.length });
  return result;
}

async function saveStore(store: { invoices: InvoiceRecord[] }) {
  const file = getStorePath();
  await atomicWrite(file, store);
  console.log('[WORKFLOW][STORE]', 'saveStore', { invoiceCount: store.invoices.length });
}

function matchInvoiceById(invoice: InvoiceRecord, targetId: string) {
  if (!invoice) return false;
  const refs = [invoice.id, invoice.invoice_number, invoice.invoice, invoice.source_file];
  return refs.some((ref) => (ref ? String(ref).trim() : '') === targetId);
}

export async function getById(id: string): Promise<InvoiceRecord | undefined> {
  const store = await loadStore();
  const target = (id || '').trim();
  const found = store.invoices.find((invoice) => matchInvoiceById(invoice, target));
  console.log('[WORKFLOW][STORE]', 'getById', { invoiceId: target, found: !!found });
  return found;
}

export async function save(invoice: InvoiceRecord): Promise<void> {
  const store = await loadStore();
  const targetId = invoice && (invoice.id || invoice.invoice_number);
  if (!targetId) {
    store.invoices.push(invoice);
    await saveStore(store);
    console.log('[WORKFLOW][STORE]', 'save', {
      invoiceId: 'generated',
      action: 'insert',
    });
    return;
  }
  const normalized = String(targetId).trim();
  const idx = store.invoices.findIndex((inv) => matchInvoiceById(inv, normalized));
  if (idx >= 0) {
    store.invoices[idx] = invoice;
  } else {
    store.invoices.push(invoice);
  }
  await saveStore(store);
  console.log('[WORKFLOW][STORE]', 'save', {
    invoiceId: normalized || 'unknown',
    action: idx >= 0 ? 'update' : 'insert',
  });
}

function isDeletedInvoice(invoice: InvoiceRecord): boolean {
  if (!invoice || typeof invoice !== 'object') return false;
  if (invoice.deleted === true) return true;
  if (invoice.deleted_meta && typeof invoice.deleted_meta === 'object') return true;
  if (invoice.workflow_deleted_at) return true;
  return false;
}

export async function listVisibleFor(filter?: (invoice: InvoiceRecord) => boolean): Promise<InvoiceRecord[]> {
  const store = await loadStore();
  const active = store.invoices.filter((inv) => !isDeletedInvoice(inv));
  const result = filter ? active.filter(filter) : active;
  console.log('[WORKFLOW][STORE]', 'listVisibleFor', {
    total: store.invoices.length,
    active: active.length,
    returned: result.length,
  });
  return result;
}

export async function listDeleted(): Promise<InvoiceRecord[]> {
  const store = await loadStore();
  const deleted = store.invoices.filter((invoice) => isDeletedInvoice(invoice));
  console.log('[WORKFLOW][STORE]', 'listDeleted', { returned: deleted.length });
  return deleted;
}

export async function softDelete(id: string, actor?: string, reason?: string): Promise<void> {
  const store = await loadStore();
  const normalized = (id || '').trim();
  let matched = false;
  const invoices = store.invoices.map((invoice) => {
    if (matchInvoiceById(invoice, normalized)) {
      matched = true;
      return {
        ...invoice,
        deleted: true,
        deleted_meta: {
          by: actor || null,
          at: new Date().toISOString(),
          reason: reason || null,
        },
        workflow_deleted_at: new Date().toISOString(),
        workflow_deleted_by: actor || null,
        workflow_deleted_reason: reason || null,
      };
    }
    return invoice;
  });
  await saveStore({ invoices });
  if (matched) {
    const logData: Record<string, unknown> = { invoiceId: normalized };
    if (actor) {
      logData.userEmail = actor.trim().toLowerCase();
    }
    console.log('[WORKFLOW][STORE]', 'softDelete', logData);
  } else {
    console.log('[WORKFLOW][STORE]', 'softDelete_miss', { invoiceId: normalized });
  }
}
