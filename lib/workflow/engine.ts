import { InvoiceApprovals, InvoiceStatus } from './types';

export interface RolesConfig {
  admins: string[];
  ap_authorizers: string[];
  office_managers: Record<string, string[]>;
  threshold_usd: number;
  test_mode_route_all_to_admin?: boolean;
}

export interface TransitionContext {
  roles: RolesConfig;
  notes?: string;
  category?: string;
  thresholdOverride?: number;
}

export interface Actor {
  email: string;
  name?: string;
}

export type TransitionAction =
  | 'categorize'
  | 'send_to_office'
  | 'approve_office'
  | 'approve_admin'
  | 'mark_paid';

function normaliseEmail(email?: string): string {
  return email ? email.trim().toLowerCase() : '';
}

function getInvoiceId(invoice: any): string {
  return (
    invoice?.id ||
    invoice?.invoice_number ||
    invoice?.invoice ||
    invoice?.source_file ||
    ''
  );
}

function logEngine(event: string, data: Record<string, unknown>) {
  console.log('[WORKFLOW][ENGINE]', event, data);
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getInvoiceOffice(invoice: any): string {
  const office = invoice?.office_location || invoice?.office || invoice?.clinic_id;
  return typeof office === 'string' ? office.trim() : '';
}

export function routeAfterAP(invoice: any, roles: RolesConfig): InvoiceStatus {
  if (roles.test_mode_route_all_to_admin) {
    const forcedStatus: InvoiceStatus = 'awaiting_admin_approval';
    logEngine('routeAfterAP_test_mode', { invoiceId: getInvoiceId(invoice) });
    return forcedStatus;
  }

  // Multi-location invoices always route to admin (McKay) for final approval
  // They bypass office manager approval entirely
  if (invoice?.is_multi_location) {
    const next: InvoiceStatus = 'awaiting_admin_approval';
    logEngine('routeAfterAP_multi_location_to_admin', { invoiceId: getInvoiceId(invoice) });
    return next;
  }

  const office = getInvoiceOffice(invoice);

  // If no office is provided, route to admin approval
  // This allows admins to approve invoices without office information
  if (!office) {
    const next: InvoiceStatus = 'awaiting_admin_approval';
    logEngine('routeAfterAP_no_office_to_admin', { invoiceId: getInvoiceId(invoice) });
    return next;
  }

  const amount = parseAmount(invoice?.total ?? invoice?.invoice_total);
  const threshold = roles.threshold_usd ?? 0;

  if (amount >= threshold) {
    const next: InvoiceStatus = 'awaiting_admin_approval';
    logEngine('routeAfterAP_to_admin', { invoiceId: getInvoiceId(invoice) });
    return next;
  }
  const next: InvoiceStatus = 'awaiting_office_approval';
  logEngine('routeAfterAP_to_office', { invoiceId: getInvoiceId(invoice) });
  return next;
}

export function nextStatusAfterOffice(invoice: any, threshold: number): InvoiceStatus {
  const amount = parseAmount(invoice?.total ?? invoice?.invoice_total);
  if (amount >= threshold) {
    const next: InvoiceStatus = 'awaiting_admin_approval';
    logEngine('nextStatusAfterOffice_to_admin', { invoiceId: getInvoiceId(invoice) });
    return next;
  }
  const next: InvoiceStatus = 'to_be_paid';
  logEngine('nextStatusAfterOffice_to_pay', { invoiceId: getInvoiceId(invoice) });
  return next;
}

export function approveAP(invoice: any, actor: Actor, roles: RolesConfig): void {
  invoice.approvals = (invoice.approvals && typeof invoice.approvals === 'object') ? invoice.approvals : {} as InvoiceApprovals;
  invoice.approvals.ap = {
    by: normaliseEmail(actor.email),
    at: new Date().toISOString(),
  };

  // NEW: Set three-stage status tracking - mark as "Coded"
  const now = new Date().toISOString();
  invoice.coded_at = now;
  invoice.coded_by_user_id = normaliseEmail(actor.email);

  invoice.status = routeAfterAP(invoice, roles);
  logEngine('approveAP', { invoiceId: getInvoiceId(invoice), userEmail: normaliseEmail(actor.email) });
}

export function approveOffice(invoice: any, actor: Actor, threshold: number): void {
  console.log('[WORKFLOW][ENGINE]', 'approveOffice_start', { invoiceId: getInvoiceId(invoice), threshold });
  invoice.approvals = (invoice.approvals && typeof invoice.approvals === 'object') ? invoice.approvals : {} as InvoiceApprovals;
  invoice.approvals.office = {
    by: normaliseEmail(actor.email),
    at: new Date().toISOString(),
  };

  // NEW: Set three-stage status tracking - mark as "Approved"
  const now = new Date().toISOString();
  invoice.approved_at = now;
  invoice.approved_by_user_id = normaliseEmail(actor.email);

  invoice.status = nextStatusAfterOffice(invoice, threshold);
  console.log('[WORKFLOW][ENGINE]', 'approveOffice_end', { invoiceId: getInvoiceId(invoice), newStatus: invoice.status });
  logEngine('approveOffice', { invoiceId: getInvoiceId(invoice), userEmail: normaliseEmail(actor.email) });
}

export function approveAdmin(invoice: any, actor: Actor): void {
  invoice.approvals = (invoice.approvals && typeof invoice.approvals === 'object') ? invoice.approvals : {} as InvoiceApprovals;
  invoice.approvals.admin = {
    by: normaliseEmail(actor.email),
    at: new Date().toISOString(),
  };
  invoice.status = 'to_be_paid';
  logEngine('approveAdmin', { invoiceId: getInvoiceId(invoice), userEmail: normaliseEmail(actor.email) });
}

export function markPaid(
  invoice: any,
  actor: Actor | { by?: string; at?: string; stripePaymentId?: string; total?: unknown; email?: string }
): void {
  invoice.approvals = (invoice.approvals && typeof invoice.approvals === 'object') ? invoice.approvals : {} as InvoiceApprovals;
  const email = (actor as any)?.email || (actor as any)?.by || '';
  const normalised = normaliseEmail(email);
  const timestamp = (actor as any)?.at || new Date().toISOString();
  const stripePaymentId = (actor as any)?.stripePaymentId;
  const total = (actor as any)?.total;

  invoice.approvals.admin = {
    ...(invoice.approvals.admin || {}),
    by: normalised || (invoice.approvals.admin?.by ?? ''),
    at: timestamp,
    ...(stripePaymentId ? { stripePaymentId } : {}),
    ...(total !== undefined ? { total } : {}),
  };

  // NEW: Set three-stage status tracking - mark as "Paid"
  invoice.paid_at = timestamp;
  invoice.paid_by_user_id = normalised;

  invoice.status = 'paid';
  logEngine('markPaid', {
    invoiceId: getInvoiceId(invoice),
    userEmail: normalised || 'unknown',
    stripePaymentId,
  });
}

function ensureRole(config: RolesConfig, email: string, role: 'ap' | 'admin' | 'office', office?: string) {
  const normalised = normaliseEmail(email);
  console.log('[RBAC]', `ensureRole_${role}`, { userEmail: normalised });
  if (role === 'admin') {
    if (config.admins.map(normaliseEmail).includes(normalised)) return;
    throw new Error('RBAC: admin role required');
  }
  if (role === 'ap') {
    if (config.ap_authorizers.map(normaliseEmail).includes(normalised) || config.admins.map(normaliseEmail).includes(normalised)) return;
    throw new Error('RBAC: ap_authorizer role required');
  }
  if (role === 'office') {
    if (!office) {
      throw new Error('RBAC: office required');
    }
    const officeEntry = Object.entries(config.office_managers || {}).find(
      ([key]) => key && key.toLowerCase() === office.toLowerCase()
    );
    const managers = officeEntry ? officeEntry[1] : [];
    const normalisedManagers = (managers || []).map(normaliseEmail);
    if (normalisedManagers.includes(normalised) || config.admins.map(normaliseEmail).includes(normalised)) return;
    throw new Error('RBAC: office manager role required');
  }
}

export function transition(
  invoice: any,
  action: TransitionAction,
  actor: Actor,
  ctx: TransitionContext
): any {
  const status: InvoiceStatus = invoice.status || 'incoming';
  const roles = ctx.roles;
  const threshold = ctx.thresholdOverride ?? roles.threshold_usd ?? 0;
  const office = getInvoiceOffice(invoice);

  switch (action) {
    case 'categorize': {
      ensureRole(roles, actor.email, 'ap');
      invoice.status = 'categorized';
      if (ctx.category) {
        invoice.category = ctx.category;
      }
      return invoice;
    }
    case 'send_to_office': {
      ensureRole(roles, actor.email, 'ap');
      if (status !== 'incoming' && status !== 'categorized') {
        throw new Error(`Cannot send_to_office from status ${status}`);
      }
      approveAP(invoice, actor, roles);
      return invoice;
    }
    case 'approve_office': {
      if (status !== 'awaiting_office_approval') {
        throw new Error(`Cannot approve_office from status ${status}`);
      }
      ensureRole(roles, actor.email, 'office', office);
      if (!office) {
        throw new Error('Office required for office approval');
      }
      approveOffice(invoice, actor, threshold);
      return invoice;
    }
    case 'approve_admin': {
      if (status !== 'awaiting_admin_approval') {
        throw new Error(`Cannot approve_admin from status ${status}`);
      }
      ensureRole(roles, actor.email, 'admin');
      approveAdmin(invoice, actor);
      return invoice;
    }
    case 'mark_paid': {
      if (status !== 'to_be_paid') {
        throw new Error(`Cannot mark_paid from status ${status}`);
      }
      ensureRole(roles, actor.email, 'admin');
      markPaid(invoice, actor);
      return invoice;
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}
