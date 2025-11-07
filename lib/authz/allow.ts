/**
 * Centralized RBAC Authorization Module
 * 
 * Deny-by-default authorization checks.
 * All permission checks go through this module.
 */

export type UserRole = 'ap' | 'office_manager' | 'admin' | 'viewer';

export interface AuthContext {
  email: string;
  role: UserRole;
  name?: string;
}

/**
 * Permission matrix: role -> actions
 */
const PERMISSIONS: Record<UserRole, Set<string>> = {
  'ap': new Set([
    'invoice:view',
    'invoice:categorize',
    'invoice:approve_ap',
    'invoice:edit_fields',
    'invoice:view_for_me',
  ]),
  'office_manager': new Set([
    'invoice:view',
    'invoice:approve_office',
    'invoice:view_for_me',
  ]),
  'admin': new Set([
    'invoice:view',
    'invoice:categorize',
    'invoice:approve_ap',
    'invoice:approve_office',
    'invoice:approve_admin',
    'invoice:edit_fields',
    'invoice:reject',
    'invoice:pay',
    'invoice:view_for_me',
    'vendor:manage',
    'system:config',
    'system:export',
  ]),
  'viewer': new Set([
    'invoice:view',
  ]),
};

/**
 * Check if user has permission for action
 * Throws error if permission denied
 */
export function allow(
  context: AuthContext,
  action: string
): void {
  const userPermissions = PERMISSIONS[context.role] || new Set();

  if (!userPermissions.has(action)) {
    throw new Error(
      `FORBIDDEN: User ${context.email} (${context.role}) cannot perform '${action}'. ` +
      `Allowed actions: ${Array.from(userPermissions).join(', ')}`
    );
  }

  console.log('[AUTHZ]', 'allowed', {
    email: context.email,
    role: context.role,
    action,
  });
}

/**
 * Check if user has permission (returns boolean)
 */
export function canPerform(
  context: AuthContext,
  action: string
): boolean {
  const userPermissions = PERMISSIONS[context.role] || new Set();
  return userPermissions.has(action);
}

/**
 * Check if user can approve at current stage
 */
export function canApprove(
  context: AuthContext,
  invoiceStatus: string
): boolean {
  if (context.role === 'admin') return true;
  if (context.role === 'ap' && ['incoming', 'categorized'].includes(invoiceStatus)) return true;
  if (context.role === 'office_manager' && invoiceStatus === 'awaiting_office_approval') return true;
  return false;
}

/**
 * Check if user can edit invoice fields
 */
export function canEditFields(context: AuthContext): boolean {
  return canPerform(context, 'invoice:edit_fields');
}

/**
 * Check if user can pay invoices
 */
export function canPay(context: AuthContext): boolean {
  return canPerform(context, 'invoice:pay');
}

/**
 * Check if user can reject invoices
 */
export function canReject(context: AuthContext): boolean {
  return canPerform(context, 'invoice:reject');
}

/**
 * Check if user can manage vendors
 */
export function canManageVendors(context: AuthContext): boolean {
  return canPerform(context, 'vendor:manage');
}

/**
 * Check if user can access system config
 */
export function canAccessSystemConfig(context: AuthContext): boolean {
  return canPerform(context, 'system:config');
}

/**
 * Check if user can export data
 */
export function canExportData(context: AuthContext): boolean {
  return canPerform(context, 'system:export');
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: UserRole): string[] {
  return Array.from(PERMISSIONS[role] || new Set());
}

/**
 * Get all roles
 */
export function getAllRoles(): UserRole[] {
  return ['ap', 'office_manager', 'admin', 'viewer'];
}

/**
 * Require admin role
 */
export function requireAdmin(context: AuthContext): void {
  if (context.role !== 'admin') {
    throw new Error(
      `FORBIDDEN: Only admins can perform this action. User ${context.email} is ${context.role}`
    );
  }
}

/**
 * Require specific role
 */
export function requireRole(context: AuthContext, role: UserRole): void {
  if (context.role !== role) {
    throw new Error(
      `FORBIDDEN: This action requires ${role} role. User ${context.email} is ${context.role}`
    );
  }
}

/**
 * Require one of multiple roles
 */
export function requireOneOf(context: AuthContext, roles: UserRole[]): void {
  if (!roles.includes(context.role)) {
    throw new Error(
      `FORBIDDEN: This action requires one of: ${roles.join(', ')}. ` +
      `User ${context.email} is ${context.role}`
    );
  }
}

