import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { resolveDataPath } from './dataDir';

export interface RolesFile {
  admins: string[];
  ap_authorizers: string[];
  office_managers: Record<string, string[]>;
  vendor_access?: Record<string, string | string[]>;
  /** When set, the vendor dropdown only shows these QBO vendors (phased rollout). */
  active_qbo_vendors?: string[];
  threshold_usd: number;
  test_mode_route_all_to_admin?: boolean;
  version?: number;
}

// Type for vendor access: "*" means all, array means specific vendors, "assigned_only" means only assigned invoices
export type VendorAccess = '*' | string[] | 'assigned_only';

const DEFAULT_ROLES: RolesFile = {
  admins: ['business@pcsmilesai.com', 'mckaym@pcsmiles.com', 'laurag@pcsmiles.com'],
  ap_authorizers: [], // Empty for now - admins handle all invoices. When populated, invoices route to AP first.
  office_managers: {
    Milwaukie: [''],
    Roseburg: [''],
    Eugene: [''],
    Lebanon: [''],
    Ridgefield: [''],
    Riddle: [''],
    Salem: [''],
    Columbia: [''],
  },
  threshold_usd: 1000,
  test_mode_route_all_to_admin: true,
  version: 1,
};

function getRolesPath(): string {
  return resolveDataPath('roles.json');
}

function getClassOverridePath(): string {
  const preferred = resolveDataPath('vendor_class_mapping.json');
  if (fssync.existsSync(preferred)) {
    return preferred;
  }
  return path.join(process.cwd(), 'vendor_class_mapping.json');
}

function logRbac(event: string, data: Record<string, unknown>) {
  console.log('[RBAC]', event, data);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function atomicWrite(filePath: string, data: any) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmpPath = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, payload, 'utf8');
  await fs.rename(tmpPath, filePath);
}

let rolesCache: RolesFile | null = null;

async function ensureSeed() {
  const file = getRolesPath();
  try {
    await fs.access(file);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await atomicWrite(file, DEFAULT_ROLES);
      rolesCache = { ...DEFAULT_ROLES };
    } else {
      throw err;
    }
  }
}

export async function readRoles(): Promise<RolesFile> {
  // Always read fresh from file to pick up changes without restart
  await ensureSeed();
  const file = getRolesPath();
  const data = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(data) as RolesFile;
  rolesCache = parsed;
  return parsed;
}

export async function saveRoles(newRoles: RolesFile): Promise<void> {
  const file = getRolesPath();
  await atomicWrite(file, newRoles);
  rolesCache = newRoles;
}

function normaliseEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

export async function isAdmin(email: string): Promise<boolean> {
  const roles = await readRoles();
  const target = normaliseEmail(email);
  const result = roles.admins.map(normaliseEmail).includes(target);
  logRbac('isAdmin', { userEmail: target, result });
  return result;
}

export async function isAP(email: string): Promise<boolean> {
  const roles = await readRoles();
  const target = normaliseEmail(email);
  const result =
    roles.ap_authorizers.map(normaliseEmail).includes(target) ||
    roles.admins.map(normaliseEmail).includes(target);
  logRbac('isAP', { userEmail: target, result });
  return result;
}

export async function officesForManager(email: string): Promise<string[]> {
  const roles = await readRoles();
  const target = normaliseEmail(email);
  const offices: string[] = [];
  Object.entries(roles.office_managers || {}).forEach(([office, list]) => {
    const normalisedList = (list || []).map(normaliseEmail).filter(Boolean);
    if (normalisedList.includes(target)) {
      offices.push(office);
    }
  });
  logRbac('officesForManager', { userEmail: target, officeCount: offices.length });
  return offices;
}

export function findVendorKey(name: string, map: Record<string, any>): string | undefined {
  if (!name || !map) return undefined;
  if (map[name]) return name;
  const target = normaliseEmail(name);
  const exact = Object.keys(map).find((key) => normaliseEmail(key) === target);
  if (exact) return exact;
  return Object.keys(map).find((key) => {
    const norm = normaliseEmail(key);
    return norm.includes(target) || target.includes(norm);
  });
}

export async function getThreshold(): Promise<number> {
  const roles = await readRoles();
  return roles.threshold_usd ?? 0;
}

export async function setThreshold(value: number): Promise<void> {
  const roles = await readRoles();
  const numeric = Number.isFinite(value) ? Number(value) : roles.threshold_usd;
  const updated: RolesFile = {
    ...roles,
    threshold_usd: numeric,
    version: (roles.version ?? 0) + 1,
  };
  await saveRoles(updated);
}

export async function getTestModeFlag(): Promise<boolean> {
  const roles = await readRoles();
  return !!roles.test_mode_route_all_to_admin;
}

export function loadClassOverrides(): Record<string, string[]> {
  const file = getClassOverridePath();
  try {
    const raw = fssync.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string[]>;
    }
  } catch (_) {
    // ignore missing file
  }
  return {};
}

/**
 * Get vendor access configuration for a user.
 * Returns:
 * - "*" for full access (developer account)
 * - string[] for specific vendor names (e.g., ["TC Dental Lab"])
 * - "assigned_only" for users who only see invoices assigned to them
 * - "*" as default for admins without explicit config
 */
export async function getVendorAccessForUser(email: string): Promise<VendorAccess> {
  const roles = await readRoles();
  const target = normaliseEmail(email);
  
  // Check vendor_access configuration
  if (roles.vendor_access) {
    for (const [configEmail, access] of Object.entries(roles.vendor_access)) {
      if (normaliseEmail(configEmail) === target) {
        logRbac('getVendorAccessForUser', { userEmail: target, access });
        return access as VendorAccess;
      }
    }
  }
  
  // Default: admins get full access if not explicitly configured
  const isUserAdmin = roles.admins.map(normaliseEmail).includes(target);
  if (isUserAdmin) {
    logRbac('getVendorAccessForUser', { userEmail: target, access: '*', reason: 'admin_default' });
    return '*';
  }
  
  // Non-admins without config get assigned_only by default
  logRbac('getVendorAccessForUser', { userEmail: target, access: 'assigned_only', reason: 'non_admin_default' });
  return 'assigned_only';
}

/**
 * Check if a user is a "verifier" (someone who verifies parsed data before sending for approval).
 * Verifiers have specific vendor access (array of vendors) instead of full access.
 */
export async function isVerifier(email: string): Promise<boolean> {
  const vendorAccess = await getVendorAccessForUser(email);
  return Array.isArray(vendorAccess);
}

/**
 * Get the approval destination email for invoices sent by a verifier.
 * Currently hardcoded to McKay, but could be made configurable.
 */
export function getApprovalDestination(): string {
  return 'mckaym@pcsmiles.com';
}

/**
 * Vendors shown in the QBO vendor dropdown during phased rollout.
 * Returns null when unset — caller should show all QBO vendors.
 */
export async function getActiveQboVendors(): Promise<string[] | null> {
  const roles = await readRoles();
  const list = roles.active_qbo_vendors;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  return list.map((v) => v.trim()).filter(Boolean);
}

/** Case-insensitive match of a QBO vendor name against an allowlist entry. */
export function vendorMatchesAllowlist(vendorName: string, allowlist: string[]): boolean {
  const normalized = vendorName.trim().toLowerCase();
  return allowlist.some((allowed) => {
    const a = allowed.trim().toLowerCase();
    return normalized === a || normalized.includes(a) || a.includes(normalized);
  });
}
