import fsp from 'fs/promises';
import path from 'path';
import { pathTo } from '@/lib/runtime/config';

const FILE_NAME = 'stripe_event_ids.json';
const MAX_IDS = 1000;

async function loadIds(): Promise<string[]> {
  const file = pathTo(FILE_NAME);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const json = JSON.parse(raw);
    if (Array.isArray(json)) return json as string[];
  } catch (_e) {}
  return [];
}

async function saveIds(ids: string[]): Promise<void> {
  const file = pathTo(FILE_NAME);
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const trimmed = ids.slice(-MAX_IDS);
  await fsp.writeFile(file, JSON.stringify(trimmed, null, 2));
}

export async function wasSeen(eventId: string): Promise<boolean> {
  const ids = await loadIds();
  return ids.includes(eventId);
}

export async function recordEventId(eventId: string): Promise<void> {
  const ids = await loadIds();
  if (!ids.includes(eventId)) {
    ids.push(eventId);
    await saveIds(ids);
  }
}



