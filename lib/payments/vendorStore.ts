import fsp from 'fs/promises';
import path from 'path';
import { pathTo } from '@/lib/runtime/config';

export type AchStatus = 'complete' | 'pending' | 'missing';
export interface VendorEntry {
  stripeAccountId?: string;
  ach_status?: AchStatus;
  aliases?: string[];
}
export interface VendorMap { vendors: Record<string, VendorEntry>; version?: number; }

const FILE_NAME = 'vendor_stripe_map.json';
const DEFAULT_MAP: VendorMap = { vendors: {} };

async function readJson(file: string): Promise<VendorMap> {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const json = JSON.parse(raw);
    if (json && typeof json === 'object' && json.vendors) return json as VendorMap;
  } catch (_e) {}
  return DEFAULT_MAP;
}

async function writeJson(file: string, data: VendorMap) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  const payload = { ...data, version: (data.version ?? 0) + 1 };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fsp.writeFile(tmp, JSON.stringify(payload, null, 2));
      await fsp.rename(tmp, file);
      // eslint-disable-next-line no-console
      console.log('[VENDOR][STORE] saved', { file, version: payload.version, count: Object.keys(payload.vendors).length });
      return;
    } catch (e: any) {
      if (attempt === 1) throw e;
      await new Promise((res) => setTimeout(res, 150));
    }
  }
}

export async function loadMap(): Promise<VendorMap> {
  const file = pathTo(FILE_NAME);
  const map = await readJson(file);
  // eslint-disable-next-line no-console
  console.log('[VENDOR][STORE] loaded', { file, version: map.version ?? 0, count: Object.keys(map.vendors).length });
  return map;
}

export async function saveMap(map: VendorMap): Promise<void> {
  const file = pathTo(FILE_NAME);
  await writeJson(file, map);
}

export function normalize(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findVendorKey(map: VendorMap, name: string): string | undefined {
  const n = normalize(name);
  for (const [key, entry] of Object.entries(map.vendors)) {
    if (normalize(key) === n) return key;
    if (entry.aliases?.some(a => normalize(a) === n)) return key;
  }
  return undefined;
}

export async function getVendors(): Promise<VendorMap['vendors']> {
  const m = await loadMap();
  return m.vendors;
}

export async function getVendor(name: string): Promise<[string, VendorEntry] | null> {
  const m = await loadMap();
  const key = findVendorKey(m, name);
  if (!key) return null;
  return [key, m.vendors[key]];
}

export async function setVendorStatus(name: string, patch: Partial<VendorEntry>): Promise<void> {
  const m = await loadMap();
  const key = findVendorKey(m, name) || name;
  const existing = m.vendors[key] || {};
  m.vendors[key] = { ...existing, ...patch };
  await saveMap(m);
}

export async function setByAccountId(acctId: string, patch: Partial<VendorEntry>): Promise<string[]> {
  const m = await loadMap();
  const updated: string[] = [];
  for (const [key, entry] of Object.entries(m.vendors)) {
    if (entry.stripeAccountId === acctId) {
      m.vendors[key] = { ...entry, ...patch };
      updated.push(key);
    }
  }
  if (updated.length > 0) await saveMap(m);
  return updated;
}

export function getMapPath(): string {
  return pathTo(FILE_NAME);
}


