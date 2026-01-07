import { isAdmin, isAP, officesForManager } from '../workflow/rolesStore';

export type UserRole = 'admin' | 'ap_manager' | 'office_manager' | 'viewer';

export interface UserPermissions {
  role: UserRole;
  email: string;
  isAdmin: boolean;
  isAPManager: boolean;
  isOfficeManager: boolean;
  managedOffices: string[];
  
  // Feature permissions
  canViewAllInvoices: boolean;
  canViewToBePaid: boolean;
  canViewVendors: boolean;
  canEditInvoices: boolean;
  canApproveInvoices: boolean;
  canRejectInvoices: boolean;
  canPayInvoices: boolean;
  canUpdateInvoices: boolean;
  canUseTemplates: boolean;
  canManageRoles: boolean;
  canViewReports: boolean;
}

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Get user permissions based on their email and role configuration
 */
export async function getUserPermissions(email: string): Promise<UserPermissions> {
  const normalizedEmail = normalizeEmail(email);
  
  if (!normalizedEmail) {
    return getViewerPermissions('');
  }

  const [adminStatus, apStatus, offices] = await Promise.all([
    isAdmin(normalizedEmail),
    isAP(normalizedEmail),
    officesForManager(normalizedEmail),
  ]);

  const isOfficeManager = offices.length > 0;

  // Determine primary role
  let role: UserRole = 'viewer';
  if (adminStatus) {
    role = 'admin';
  } else if (apStatus) {
    role = 'ap_manager';
  } else if (isOfficeManager) {
    role = 'office_manager';
  }

  // Admin permissions - full access
  if (adminStatus) {
    return {
      role: 'admin',
      email: normalizedEmail,
      isAdmin: true,
      isAPManager: apStatus,
      isOfficeManager: isOfficeManager,
      managedOffices: offices,
      canViewAllInvoices: true,
      canViewToBePaid: true,
      canViewVendors: true,
      canEditInvoices: true,
      canApproveInvoices: true,
      canRejectInvoices: true,
      canPayInvoices: true,
      canUpdateInvoices: true,
      canUseTemplates: true,
      canManageRoles: true,
      canViewReports: true,
    };
  }

  // AP Manager permissions - same as admin for invoice operations
  if (apStatus) {
    return {
      role: 'ap_manager',
      email: normalizedEmail,
      isAdmin: false,
      isAPManager: true,
      isOfficeManager: isOfficeManager,
      managedOffices: offices,
      canViewAllInvoices: true,
      canViewToBePaid: true,
      canViewVendors: true,
      canEditInvoices: true,
      canApproveInvoices: true,
      canRejectInvoices: true,
      canPayInvoices: true,
      canUpdateInvoices: true,
      canUseTemplates: true,
      canManageRoles: false,
      canViewReports: true,
    };
  }

  // Office Manager permissions - restricted
  if (isOfficeManager) {
    return {
      role: 'office_manager',
      email: normalizedEmail,
      isAdmin: false,
      isAPManager: false,
      isOfficeManager: true,
      managedOffices: offices,
      canViewAllInvoices: true, // Can only see their own invoices
      canViewToBePaid: false, // Cannot see To Be Paid
      canViewVendors: false, // Cannot see Vendors
      canEditInvoices: false, // Cannot edit invoice fields
      canApproveInvoices: true, // Can approve invoices assigned to them
      canRejectInvoices: true, // Can reject invoices assigned to them
      canPayInvoices: false, // Cannot pay invoices
      canUpdateInvoices: false, // Cannot update invoice fields
      canUseTemplates: false, // Cannot use coding templates
      canManageRoles: false,
      canViewReports: false,
    };
  }

  return getViewerPermissions(normalizedEmail);
}

function getViewerPermissions(email: string): UserPermissions {
  return {
    role: 'viewer',
    email,
    isAdmin: false,
    isAPManager: false,
    isOfficeManager: false,
    managedOffices: [],
    canViewAllInvoices: false,
    canViewToBePaid: false,
    canViewVendors: false,
    canEditInvoices: false,
    canApproveInvoices: false,
    canRejectInvoices: false,
    canPayInvoices: false,
    canUpdateInvoices: false,
    canUseTemplates: false,
    canManageRoles: false,
    canViewReports: false,
  };
}

/**
 * Get user permissions synchronously from client-side data
 * Used in React components where async isn't available
 */
export function getUserPermissionsSync(
  email: string,
  rolesData: { admins: string[]; ap_authorizers: string[]; office_managers: Record<string, string[]> }
): UserPermissions {
  const normalizedEmail = normalizeEmail(email);
  
  if (!normalizedEmail) {
    return getViewerPermissions('');
  }

  const admins = (rolesData.admins || []).map(normalizeEmail);
  const apManagers = (rolesData.ap_authorizers || []).map(normalizeEmail);
  
  const isAdminUser = admins.includes(normalizedEmail);
  const isAPUser = apManagers.includes(normalizedEmail);
  
  // Find offices managed by this user
  const managedOffices: string[] = [];
  for (const [office, managers] of Object.entries(rolesData.office_managers || {})) {
    const normalizedManagers = (managers || []).map(normalizeEmail);
    if (normalizedManagers.includes(normalizedEmail)) {
      managedOffices.push(office);
    }
  }
  
  const isOfficeManager = managedOffices.length > 0;

  if (isAdminUser) {
    return {
      role: 'admin',
      email: normalizedEmail,
      isAdmin: true,
      isAPManager: isAPUser,
      isOfficeManager,
      managedOffices,
      canViewAllInvoices: true,
      canViewToBePaid: true,
      canViewVendors: true,
      canEditInvoices: true,
      canApproveInvoices: true,
      canRejectInvoices: true,
      canPayInvoices: true,
      canUpdateInvoices: true,
      canUseTemplates: true,
      canManageRoles: true,
      canViewReports: true,
    };
  }

  if (isAPUser) {
    return {
      role: 'ap_manager',
      email: normalizedEmail,
      isAdmin: false,
      isAPManager: true,
      isOfficeManager,
      managedOffices,
      canViewAllInvoices: true,
      canViewToBePaid: true,
      canViewVendors: true,
      canEditInvoices: true,
      canApproveInvoices: true,
      canRejectInvoices: true,
      canPayInvoices: true,
      canUpdateInvoices: true,
      canUseTemplates: true,
      canManageRoles: false,
      canViewReports: true,
    };
  }

  if (isOfficeManager) {
    return {
      role: 'office_manager',
      email: normalizedEmail,
      isAdmin: false,
      isAPManager: false,
      isOfficeManager: true,
      managedOffices,
      canViewAllInvoices: true,
      canViewToBePaid: false,
      canViewVendors: false,
      canEditInvoices: false,
      canApproveInvoices: true,
      canRejectInvoices: true,
      canPayInvoices: false,
      canUpdateInvoices: false,
      canUseTemplates: false,
      canManageRoles: false,
      canViewReports: false,
    };
  }

  return getViewerPermissions(normalizedEmail);
}

