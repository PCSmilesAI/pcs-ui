/**
 * Invoice Reassignment Service
 * 
 * Handles reassigning invoices from one user to another.
 * Supports reassigning to:
 * - Office locations (mapped to office managers)
 * - AP Manager
 * - Admin users
 */

import { getDatabase } from '../db/client';
import { readRoles } from '../workflow/rolesStore';
import { isAdmin, isAP, officesForManager } from '../workflow/rolesStore';
import { readOffices } from '../company/officesStore';

export interface ReassignmentTarget {
  type: 'office' | 'ap' | 'admin';
  id: string;
  name: string;
  email: string;
}

/**
 * Get all valid reassignment targets for the current user
 * Returns: offices (with their managers), AP manager, and all admins
 */
export async function getReassignmentTargets(): Promise<ReassignmentTarget[]> {
  const roles = await readRoles();
  const offices = await readOffices();
  const targets: ReassignmentTarget[] = [];
  const addedEmails = new Set<string>(); // Track added emails to avoid duplicates

  // Add all office managers from the company offices data (office_info.json)
  // This includes ALL office managers with their actual email addresses
  for (const office of offices) {
    if (office.email && office.email.trim()) {
      const email = office.email.trim().toLowerCase();
      if (!addedEmails.has(email)) {
        addedEmails.add(email);
        const managerName = office.manager ? ` - ${office.manager}` : '';
        targets.push({
          type: 'office',
          id: office.name,
          name: `${office.name}${managerName} (Office Manager)`,
          email: email,
        });
      }
    }
  }

  // Also add any office managers from roles.json that aren't already included
  // (in case there are configured roles not in office_info.json)
  if (roles.office_managers) {
    for (const [officeName, managers] of Object.entries(roles.office_managers)) {
      // Add ALL managers for this office, not just the first one
      for (const managerEmail of managers || []) {
        if (managerEmail && managerEmail.trim()) {
          const email = managerEmail.trim().toLowerCase();
          if (!addedEmails.has(email)) {
            addedEmails.add(email);
            targets.push({
              type: 'office',
              id: officeName,
              name: `${officeName} (Office Manager)`,
              email: email,
            });
          }
        }
      }
    }
  }

  // Add AP Manager
  if (roles.ap_authorizers && roles.ap_authorizers.length > 0) {
    const apEmail = roles.ap_authorizers[0];
    if (apEmail && apEmail.trim()) {
      const email = apEmail.trim().toLowerCase();
      if (!addedEmails.has(email)) {
        addedEmails.add(email);
        targets.push({
          type: 'ap',
          id: 'ap',
          name: 'AP Manager',
          email: email,
        });
      }
    }
  }

  // Add all admins
  if (roles.admins) {
    for (const adminEmail of roles.admins) {
      if (adminEmail && adminEmail.trim()) {
        const email = adminEmail.trim().toLowerCase();
        if (!addedEmails.has(email)) {
          addedEmails.add(email);
          targets.push({
            type: 'admin',
            id: email,
            name: `Admin (${email})`,
            email: email,
          });
        }
      }
    }
  }

  return targets;
}

/**
 * Validate that a user can reassign an invoice
 * Returns true if the user has access to the invoice
 */
export async function canReassignInvoice(
  userEmail: string,
  invoiceId: string
): Promise<boolean> {
  const db = getDatabase();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

  if (!invoice) {
    return false;
  }

  // Check if user is admin or AP
  const [admin, ap] = await Promise.all([isAdmin(userEmail), isAP(userEmail)]);
  if (admin || ap) {
    return true;
  }

  // Check if user is the current assignee
  if (invoice.current_assigned_user_email) {
    const normalizedInvoiceEmail = invoice.current_assigned_user_email.trim().toLowerCase();
    const normalizedUserEmail = userEmail.trim().toLowerCase();
    if (normalizedInvoiceEmail === normalizedUserEmail) {
      return true;
    }
  }

  // Check if user is an office manager for the invoice's office
  const offices = await officesForManager(userEmail);
  if (offices.length > 0 && invoice.office_id) {
    return offices.includes(invoice.office_id);
  }

  return false;
}

/**
 * Validate that a target is valid for reassignment
 */
export async function isValidReassignmentTarget(targetEmail: string): Promise<boolean> {
  const targets = await getReassignmentTargets();
  return targets.some(t => t.email.toLowerCase() === targetEmail.toLowerCase());
}

/**
 * Reassign an invoice to a new user
 * Returns the updated invoice or throws an error
 */
export async function reassignInvoice(
  invoiceId: string,
  targetEmail: string,
  fromUserEmail: string
): Promise<any> {
  const db = getDatabase();

  // Validate permissions
  const canReassign = await canReassignInvoice(fromUserEmail, invoiceId);
  if (!canReassign) {
    throw new Error('You do not have permission to reassign this invoice');
  }

  // Validate target
  const isValid = await isValidReassignmentTarget(targetEmail);
  if (!isValid) {
    throw new Error('Invalid reassignment target');
  }

  // Get current invoice
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Update invoice assignment
  const normalizedTargetEmail = targetEmail.trim().toLowerCase();
  db.prepare(`
    UPDATE invoices 
    SET current_assigned_user_email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(normalizedTargetEmail, invoiceId);

  // Log the reassignment action
  db.prepare(`
    INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    invoiceId,
    'reassigned',
    fromUserEmail,
    JSON.stringify({
      from_user: fromUserEmail,
      to_user: normalizedTargetEmail,
      timestamp: new Date().toISOString(),
    })
  );

  // Return updated invoice
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

