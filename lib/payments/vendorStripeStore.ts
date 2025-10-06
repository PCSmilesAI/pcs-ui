import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { getVendorMapPath } from '@/lib/runtime/config';

type VendorEntry = {
  stripeAccountId?: string;
  ach_status?: 'missing' | 'pending' | 'complete';
  aliases?: string[];
};

export type VendorMap = { vendors: Record<string, VendorEntry> };

const DEFAULT_MAP: VendorMap = { vendors: {} };

async function readJson(file: string): Promise<VendorMap> {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const json = JSON.parse(raw);
    if (json && typeof json === 'object' && json.vendors) return json as VendorMap;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[VENDOR_MAP] read failed', { file, err: e?.message });
  }
  return DEFAULT_MAP;
}

async function writeJson(file: string, data: VendorMap) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

export async function loadVendorMap(): Promise<{ map: VendorMap; path: string }> {
  const file = getVendorMapPath();
  const map = await readJson(file);
  // eslint-disable-next-line no-console
  console.log('[VENDOR_MAP] loaded', { file, count: Object.keys(map.vendors).length });
  return { map, path: file };
}

export async function saveVendorMap(map: VendorMap): Promise<void> {
  const file = getVendorMapPath();
  await writeJson(file, map);
  // eslint-disable-next-line no-console
  console.log('[VENDOR_MAP] saved', { file, count: Object.keys(map.vendors).length });
}

export function normalizeVendorName(name: string) {
  return name?.trim().toLowerCase();
}

export function findVendorKey(map: VendorMap, input: string): string | undefined {
  const needle = normalizeVendorName(input);
  for (const [key, v] of Object.entries(map.vendors)) {
    if (normalizeVendorName(key) === needle) return key;
    if (v.aliases?.some(a => normalizeVendorName(a) === needle)) return key;
  }
  return undefined;
}




