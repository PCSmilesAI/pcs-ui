import fs from 'fs';
import path from 'path';

export type VendorRecord = {
  stripeAccountId?: string;
  ach_status?: 'complete' | 'pending' | 'missing';
  last_event?: string;
  updated_at?: string;
};

export type VendorPayments = {
  vendors: Record<string, VendorRecord>;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function getStorePath(): string {
  const base = process.env.INVOICE_DATA_DIR && process.env.INVOICE_DATA_DIR.trim().length > 0
    ? process.env.INVOICE_DATA_DIR
    : '/var/www/pcs-ui-data';
  ensureDir(base);
  return path.join(base, 'vendor_payments.json');
}

export async function readVendorPayments(): Promise<VendorPayments> {
  const file = getStorePath();
  try {
    const buf = await fs.promises.readFile(file, 'utf8');
    const data = JSON.parse(buf);
    if (data && typeof data === 'object' && data.vendors && typeof data.vendors === 'object') {
      return { vendors: data.vendors } as VendorPayments;
    }
  } catch (_) {
    // ignore; will create fresh file
  }
  return { vendors: {} };
}

export async function writeVendorPayments(data: VendorPayments): Promise<void> {
  const file = getStorePath();
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, file);
}

export async function setVendorStatus(
  vendorName: string,
  updates: Partial<VendorRecord>
): Promise<void> {
  const current = await readVendorPayments();
  const existing = current.vendors[vendorName] || {};
  current.vendors[vendorName] = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  await writeVendorPayments(current);
}


