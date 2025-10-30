import fs from 'fs';
import path from 'path';

const MAP_PATH = path.resolve(process.cwd(), 'pcs_ai_data/vendor_stripe_map.json');

let cache: Record<string, string> | null = null;

function loadMap(): Record<string, string> {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(MAP_PATH, 'utf8');
    cache = JSON.parse(raw) as Record<string, string>;
  } catch (_) {
    cache = {};
  }
  return cache!;
}

export function getStripeAccountIdForVendor(vendorName: string): string | undefined {
  const map = loadMap();
  return map[vendorName];
}

export function getVendorsForAccount(accountId: string): string[] {
  const map = loadMap();
  return Object.entries(map)
    .filter(([, acct]) => acct === accountId)
    .map(([name]) => name);
}




