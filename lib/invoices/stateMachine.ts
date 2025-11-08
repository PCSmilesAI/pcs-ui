/**
 * Invoice State Machine
 * 
 * Centralized, durable state machine for invoice workflow.
 * Single source of truth for allowed transitions.
 * All transitions are logged to audit trail.
 */

import { InvoiceStatus } from '../workflow/types';

export interface StateTransition {
  timestamp: string;
  invoiceId: string;
  fromState: InvoiceStatus;
  toState: InvoiceStatus;
  action: string;
  actorEmail: string;
  actorRole: 'ap' | 'office_manager' | 'admin';
  reason?: string;
}

/**
 * Allowed state transitions
 * Format: fromState -> [allowedToStates]
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  'incoming': ['categorized', 'awaiting_office_approval', 'awaiting_admin_approval', 'rejected', 'repair'],
  'categorized': ['awaiting_office_approval', 'awaiting_admin_approval', 'rejected', 'repair'],
  'awaiting_office_approval': ['to_be_paid', 'awaiting_admin_approval', 'rejected', 'repair'],
  'awaiting_admin_approval': ['to_be_paid', 'rejected', 'repair'],
  'to_be_paid': ['paid', 'rejected', 'repair'],
  'paid': ['rejected'], // Terminal state, only rejection allowed
  'rejected': [], // Terminal state
  'repair': ['incoming', 'categorized', 'rejected'], // After repair, restart workflow
  'removed': [], // Terminal state
};

/**
 * Role-based action permissions
 */
const ROLE_PERMISSIONS: Record<string, InvoiceStatus[]> = {
  'ap': ['incoming', 'categorized', 'awaiting_office_approval', 'awaiting_admin_approval'],
  'office_manager': ['awaiting_office_approval'],
  'admin': ['incoming', 'categorized', 'awaiting_office_approval', 'awaiting_admin_approval', 'to_be_paid', 'paid'],
};

/**
 * Validate a state transition
 * @throws Error if transition is invalid
 */
export function validateTransition(
  currentState: InvoiceStatus,
  nextState: InvoiceStatus,
  actorRole: 'ap' | 'office_manager' | 'admin'
): void {
  // Check if transition is allowed
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `INVALID_TRANSITION: Cannot transition from '${currentState}' to '${nextState}'. ` +
      `Allowed transitions: ${allowed.join(', ') || 'none'}`
    );
  }

  // Check if actor role can perform this action
  const roleAllowed = ROLE_PERMISSIONS[actorRole] || [];
  if (!roleAllowed.includes(nextState)) {
    throw new Error(
      `FORBIDDEN: Role '${actorRole}' cannot transition to '${nextState}'. ` +
      `Allowed states: ${roleAllowed.join(', ')}`
    );
  }
}

/**
 * Execute a state transition
 * Returns the transition record for audit logging
 */
export function executeTransition(
  invoiceId: string,
  currentState: InvoiceStatus,
  nextState: InvoiceStatus,
  actorEmail: string,
  actorRole: 'ap' | 'office_manager' | 'admin',
  action: string,
  reason?: string
): StateTransition {
  // Validate the transition
  validateTransition(currentState, nextState, actorRole);

  // Create audit record
  const transition: StateTransition = {
    timestamp: new Date().toISOString(),
    invoiceId,
    fromState: currentState,
    toState: nextState,
    action,
    actorEmail: actorEmail.toLowerCase().trim(),
    actorRole,
    reason,
  };

  // Log the transition
  console.log('[STATE_MACHINE]', 'transition', {
    invoiceId,
    from: currentState,
    to: nextState,
    actor: actorEmail,
    role: actorRole,
    action,
  });

  return transition;
}

/**
 * Get allowed next states for current state
 */
export function getAllowedNextStates(currentState: InvoiceStatus): InvoiceStatus[] {
  return ALLOWED_TRANSITIONS[currentState] || [];
}

/**
 * Check if a state is terminal (no further transitions allowed)
 */
export function isTerminalState(state: InvoiceStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[state] || [];
  return allowed.length === 0;
}

/**
 * Get human-readable state name
 */
export function getStateLabel(state: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    'incoming': 'Incoming',
    'categorized': 'Categorized',
    'awaiting_office_approval': 'Awaiting Office Approval',
    'awaiting_admin_approval': 'Awaiting Admin Approval',
    'to_be_paid': 'To Be Paid',
    'paid': 'Paid',
    'rejected': 'Rejected',
    'repair': 'Needs Repair',
    'removed': 'Removed',
  };
  return labels[state] || state;
}

/**
 * Format status value for display in UI (converts snake_case to Title Case)
 */
export function formatStatusForDisplay(status: string | undefined | null): string {
  if (!status) return 'Unknown';
  const normalized = String(status).toLowerCase().trim();
  const labels: Record<string, string> = {
    'incoming': 'Incoming',
    'categorized': 'Categorized',
    'awaiting_office_approval': 'Awaiting Office Approval',
    'awaiting_admin_approval': 'Awaiting Admin Approval',
    'to_be_paid': 'To Be Paid',
    'paid': 'Paid',
    'rejected': 'Rejected',
    'repair': 'Needs Repair',
    'removed': 'Removed',
    'pending': 'Pending',
    'completed': 'Completed',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

