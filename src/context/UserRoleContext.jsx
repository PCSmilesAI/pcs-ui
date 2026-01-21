'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * User permissions based on role
 * - admin: Full access to everything
 * - ap_manager: Full access to invoice operations, no role management
 * - office_manager: Restricted - can only approve/reject invoices, no editing, no pay
 * - viewer: Read-only access
 */
const defaultPermissions = {
  role: 'viewer',
  email: '',
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
  loading: true,
};

const UserRoleContext = createContext({
  permissions: defaultPermissions,
  refreshPermissions: () => {},
});

export function useUserRole() {
  return useContext(UserRoleContext);
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function getUserPermissionsFromRoles(email, rolesData) {
  const normalizedEmail = normalizeEmail(email);
  
  if (!normalizedEmail || !rolesData) {
    return { ...defaultPermissions, loading: false };
  }

  const admins = (rolesData.admins || []).map(normalizeEmail);
  const apManagers = (rolesData.ap_authorizers || []).map(normalizeEmail);
  
  const isAdminUser = admins.includes(normalizedEmail);
  const isAPUser = apManagers.includes(normalizedEmail);
  
  // Find offices managed by this user
  const managedOffices = [];
  for (const [office, managers] of Object.entries(rolesData.office_managers || {})) {
    const normalizedManagers = (managers || []).map(normalizeEmail);
    if (normalizedManagers.includes(normalizedEmail)) {
      managedOffices.push(office);
    }
  }
  
  const isOfficeManager = managedOffices.length > 0;

  // Admin - full access
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
      loading: false,
    };
  }

  // AP Manager - full invoice operations
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
      loading: false,
    };
  }

  // Office Manager - restricted access
  if (isOfficeManager) {
    return {
      role: 'office_manager',
      email: normalizedEmail,
      isAdmin: false,
      isAPManager: false,
      isOfficeManager: true,
      managedOffices,
      canViewAllInvoices: true, // Only sees their own invoices
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
      loading: false,
    };
  }

  // Default viewer
  return {
    ...defaultPermissions,
    email: normalizedEmail,
    loading: false,
  };
}

export function UserRoleProvider({ children }) {
  const [permissions, setPermissions] = useState(defaultPermissions);

  const refreshPermissions = useCallback(async () => {
    try {
      // Get current user email from localStorage
      let userEmail = '';
      if (typeof window !== 'undefined') {
        try {
          const stored = window.localStorage.getItem('loggedInUser');
          if (stored) {
            const parsed = JSON.parse(stored);
            userEmail = parsed?.email || '';
          }
        } catch (e) {
          console.warn('[UserRole] Error reading user from localStorage:', e);
        }
      }

      if (!userEmail) {
        setPermissions({ ...defaultPermissions, loading: false });
        return;
      }

      // Fetch roles configuration
      const response = await fetch('/api/workflow/roles', { cache: 'no-store' });
      if (!response.ok) {
        console.warn('[UserRole] Failed to fetch roles:', response.status);
        setPermissions({ ...defaultPermissions, email: userEmail, loading: false });
        return;
      }

      const rolesData = await response.json();
      // API returns { ok: true, roles: {...} }, extract the roles object
      const roles = rolesData.roles || rolesData;
      const newPermissions = getUserPermissionsFromRoles(userEmail, roles);
      
      console.log('[UserRole] Permissions loaded:', {
        email: userEmail,
        role: newPermissions.role,
        isAdmin: newPermissions.isAdmin,
        isAPManager: newPermissions.isAPManager,
        isOfficeManager: newPermissions.isOfficeManager,
      });

      setPermissions(newPermissions);
    } catch (error) {
      console.error('[UserRole] Error fetching permissions:', error);
      setPermissions({ ...defaultPermissions, loading: false });
    }
  }, []);

  // Load permissions on mount
  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Listen for login/logout changes
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'loggedInUser') {
        refreshPermissions();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }
  }, [refreshPermissions]);

  return (
    <UserRoleContext.Provider value={{ permissions, refreshPermissions }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export default UserRoleContext;

