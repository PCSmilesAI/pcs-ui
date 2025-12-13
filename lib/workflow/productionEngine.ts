/**
 * Production Approval Workflow Engine
 * Handles the approval flow logic for production mode
 */

export interface UserInfo {
  email: string;
  name?: string;
}

export interface RolesConfig {
  roles: {
    admins: string[];
    ap_authorizers: string[];
    office_managers: Record<string, string[]>;
    threshold_usd?: number;
  };
}

export type ApprovalAction = 'approve_ap' | 'approve_om' | 'approve_admin' | 'mark_paid';

/**
 * Validate if user has permission to perform the approval action
 */
export function validateApprovalPermission(
  action: ApprovalAction,
  user: UserInfo,
  invoice: any,
  config: RolesConfig
): boolean {
  const normalizedEmail = user.email.toLowerCase().trim();
  const { roles } = config;

  switch (action) {
    case 'approve_ap':
      // AP users can approve
      return roles.ap_authorizers?.map(e => e.toLowerCase().trim()).includes(normalizedEmail) || false;
    
    case 'approve_om':
      // Office managers can approve their office invoices
      for (const [office, managers] of Object.entries(roles.office_managers || {})) {
        if (managers.map(e => e.toLowerCase().trim()).includes(normalizedEmail)) {
          return true;
        }
      }
      return false;
    
    case 'approve_admin':
      // Admins can approve
      return roles.admins?.map(e => e.toLowerCase().trim()).includes(normalizedEmail) || false;
    
    case 'mark_paid':
      // Office managers and admins can mark as paid
      const isAdmin = roles.admins?.map(e => e.toLowerCase().trim()).includes(normalizedEmail);
      if (isAdmin) return true;
      for (const [office, managers] of Object.entries(roles.office_managers || {})) {
        if (managers.map(e => e.toLowerCase().trim()).includes(normalizedEmail)) {
          return true;
        }
      }
      return false;
    
    default:
      return false;
  }
}

/**
 * Approve invoice as AP
 */
export function approveAsAP(invoice: any, user: UserInfo, config: RolesConfig): void {
  invoice.ap_approved_at = new Date().toISOString();
  invoice.ap_approved_by = user.email;
  invoice.approval_stage = 'awaiting_om';
}

/**
 * Approve invoice as Office Manager
 */
export function approveAsOM(invoice: any, user: UserInfo, config: RolesConfig): void {
  invoice.om_approved_at = new Date().toISOString();
  invoice.om_approved_by = user.email;
  
  // Check if admin approval is needed based on threshold
  const threshold = (config.roles.threshold_usd || 500) * 100; // Convert to cents
  if (invoice.amount_cents && invoice.amount_cents > threshold) {
    invoice.approval_stage = 'awaiting_admin';
  } else {
    invoice.approval_stage = 'ready_to_pay';
    invoice.status = 'to_be_paid';
  }
}

/**
 * Approve invoice as Admin
 */
export function approveAsAdmin(invoice: any, user: UserInfo): void {
  invoice.admin_approved_at = new Date().toISOString();
  invoice.admin_approved_by = user.email;
  invoice.approval_stage = 'ready_to_pay';
  invoice.status = 'to_be_paid';
}

/**
 * Mark invoice as paid by Office Manager
 */
export function markAsPaidByOM(invoice: any, user: UserInfo): void {
  invoice.paid_at = new Date().toISOString();
  invoice.paid_by_user_id = user.email;
  invoice.approval_stage = 'paid';
  invoice.status = 'paid';
}




