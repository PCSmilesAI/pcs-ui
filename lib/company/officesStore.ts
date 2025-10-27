import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { resolveDataPath } from '../workflow/dataDir';

export type OfficeInfo = {
  name: string;
  address?: string;
  manager?: string;
  email?: string;
};

function getStorePath(): string {
  return resolveDataPath('office_info.json');
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
  const seedPaths = [
    path.join(process.cwd(), 'public', 'office_info.json'),
  ];
  for (const p of seedPaths) {
    if (fssync.existsSync(p)) {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          await atomicWrite(targetPath, parsed);
          return;
        }
      } catch (_) {
        // ignore parse errors and continue
      }
    }
  }
  await atomicWrite(targetPath, []);
}

export async function readOffices(): Promise<OfficeInfo[]> {
  const file = getStorePath();
  try {
    await fs.access(file);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      await trySeed(file);
    } else {
      throw err;
    }
  }
  // If the file exists but is zero-length, seed it from public
  try {
    const st = await fs.stat(file);
    if (st.size === 0) {
      await trySeed(file);
    }
  } catch (_) {
    // ignore
  }
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    let list = Array.isArray(parsed) ? (parsed as OfficeInfo[]) : [];
    if (list.length === 0) {
      // Fallback: read public seed directly if PCS file parsed but is empty
      try {
        const seedPath = path.join(process.cwd(), 'public', 'office_info.json');
        const seedRaw = await fs.readFile(seedPath, 'utf8');
        const seedParsed = JSON.parse(seedRaw);
        if (Array.isArray(seedParsed) && seedParsed.length > 0) {
          list = seedParsed as OfficeInfo[];
          await atomicWrite(file, list);
        }
      } catch (_) {
        // no seed available
      }
    }
    return list;
  } catch (_) {
    return [];
  }
}

export async function saveOffices(offices: OfficeInfo[]): Promise<void> {
  const file = getStorePath();
  await atomicWrite(file, offices);
}


