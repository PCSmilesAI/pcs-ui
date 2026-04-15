import fs from 'fs';
import path from 'path';

let cachedAccounts: { mtimeMs: number | null; set: Set<string> } | null = null;

function getChartPath(): string {
  const preferred = path.join(process.cwd(), 'pcs_ai_data', 'chart_of_accounts.json');
  if (fs.existsSync(preferred)) return preferred;
  return path.join(process.cwd(), 'chart_of_accounts.json');
}

function normalise(value: string): string {
  return value.trim().replace(/\s*:\s*/g, ':').replace(/\s+/g, ' ').toLowerCase();
}

export function loadChartOfAccounts(): Set<string> {
  const filePath = getChartPath();
  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const mtimeMs = stat ? stat.mtimeMs : null;

    if (cachedAccounts && cachedAccounts.mtimeMs === mtimeMs) {
      return cachedAccounts.set;
    }

    if (!fs.existsSync(filePath)) {
      cachedAccounts = { mtimeMs, set: new Set() };
      return cachedAccounts.set;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    const set = new Set<string>();
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        set.add(normalise(entry));
      }
    }

    cachedAccounts = { mtimeMs, set };
    return set;
  } catch (error) {
    console.warn('[QBO][CHART] Failed to load chart_of_accounts.json:', error);
    cachedAccounts = cachedAccounts || { mtimeMs: null, set: new Set() };
    return cachedAccounts.set;
  }
}

export function isValidAccountPath(accountPath?: string | null): boolean {
  if (!accountPath) return false;
  const set = loadChartOfAccounts();
  return set.has(normalise(accountPath));
}
