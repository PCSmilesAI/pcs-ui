import { describe, it, expect } from 'vitest';
import {
  transition,
  approveAP,
  approveOffice,
  approveAdmin,
  markPaid,
  routeAfterAP,
  nextStatusAfterOffice,
  RolesConfig,
  Actor,
} from '../lib/workflow/engine';

const ROLES: RolesConfig = {
  admins: ['admin@test.com'],
  ap_authorizers: ['ap@test.com', 'admin@test.com'],
  office_managers: {
    clinic_portland: ['om@test.com', 'admin@test.com'],
  },
  threshold_usd: 500,
  test_mode_route_all_to_admin: false,
};

const actor: Actor = { email: 'admin@test.com', name: 'Admin' };
const apActor: Actor = { email: 'ap@test.com', name: 'AP User' };

function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv_001',
    invoice_number: 'TEST-001',
    status: 'incoming',
    total: 100,
    office_location: 'clinic_portland',
    approvals: {},
    ...overrides,
  };
}

describe('routeAfterAP', () => {
  it('routes under-threshold to office approval', () => {
    const invoice = makeInvoice({ total: 100 });
    const result = routeAfterAP(invoice, ROLES);
    expect(result).toBe('awaiting_office_approval');
  });

  it('routes over-threshold to admin approval', () => {
    const invoice = makeInvoice({ total: 1000 });
    const result = routeAfterAP(invoice, ROLES);
    expect(result).toBe('awaiting_admin_approval');
  });

  it('routes to admin when test_mode is on', () => {
    const invoice = makeInvoice({ total: 100 });
    const testRoles = { ...ROLES, test_mode_route_all_to_admin: true };
    const result = routeAfterAP(invoice, testRoles);
    expect(result).toBe('awaiting_admin_approval');
  });

  it('routes multi-location invoices to admin', () => {
    const invoice = makeInvoice({ total: 100, is_multi_location: true });
    const result = routeAfterAP(invoice, ROLES);
    expect(result).toBe('awaiting_admin_approval');
  });

  it('routes no-office invoices to admin', () => {
    const invoice = makeInvoice({ total: 100, office_location: '' });
    const result = routeAfterAP(invoice, ROLES);
    expect(result).toBe('awaiting_admin_approval');
  });
});

describe('nextStatusAfterOffice', () => {
  it('goes to paid if under threshold', () => {
    const invoice = makeInvoice({ total: 100 });
    expect(nextStatusAfterOffice(invoice, 500)).toBe('to_be_paid');
  });

  it('goes to admin if over threshold', () => {
    const invoice = makeInvoice({ total: 1000 });
    expect(nextStatusAfterOffice(invoice, 500)).toBe('awaiting_admin_approval');
  });
});

describe('approveAP', () => {
  it('sets AP approval and routes invoice', () => {
    const invoice = makeInvoice();
    approveAP(invoice, apActor, ROLES);
    expect(invoice.approvals.ap.by).toBe('ap@test.com');
    expect(invoice.coded_at).toBeDefined();
    expect(invoice.status).toBe('awaiting_office_approval');
  });
});

describe('approveOffice', () => {
  it('sets office approval and routes to paid (under threshold)', () => {
    const invoice = makeInvoice({ total: 100, status: 'awaiting_office_approval' });
    approveOffice(invoice, actor, 500);
    expect(invoice.approvals.office.by).toBe('admin@test.com');
    expect(invoice.status).toBe('to_be_paid');
  });
});

describe('approveAdmin', () => {
  it('sets admin approval and moves to to_be_paid', () => {
    const invoice = makeInvoice({ status: 'awaiting_admin_approval' });
    approveAdmin(invoice, actor);
    expect(invoice.approvals.admin.by).toBe('admin@test.com');
    expect(invoice.status).toBe('to_be_paid');
  });
});

describe('markPaid', () => {
  it('sets paid status', () => {
    const invoice = makeInvoice({ status: 'to_be_paid' });
    markPaid(invoice, actor);
    expect(invoice.status).toBe('paid');
    expect(invoice.paid_at).toBeDefined();
  });
});

describe('transition (with RBAC)', () => {
  it('allows AP user to send_to_office', () => {
    const invoice = makeInvoice();
    transition(invoice, 'send_to_office', apActor, { roles: ROLES });
    expect(invoice.status).toBe('awaiting_office_approval');
  });

  it('rejects non-AP user from send_to_office', () => {
    const invoice = makeInvoice();
    const stranger: Actor = { email: 'nobody@test.com' };
    expect(() => {
      transition(invoice, 'send_to_office', stranger, { roles: ROLES });
    }).toThrow('RBAC');
  });

  it('allows admin to approve_admin', () => {
    const invoice = makeInvoice({ status: 'awaiting_admin_approval' });
    transition(invoice, 'approve_admin', actor, { roles: ROLES });
    expect(invoice.status).toBe('to_be_paid');
  });

  it('rejects non-admin from approve_admin', () => {
    const invoice = makeInvoice({ status: 'awaiting_admin_approval' });
    expect(() => {
      transition(invoice, 'approve_admin', apActor, { roles: ROLES });
    }).toThrow('RBAC');
  });

  it('allows office manager to approve_office', () => {
    const invoice = makeInvoice({ status: 'awaiting_office_approval', office_location: 'clinic_portland' });
    const omActor: Actor = { email: 'om@test.com' };
    transition(invoice, 'approve_office', omActor, { roles: ROLES });
    expect(invoice.status).toBe('to_be_paid');
  });

  it('rejects wrong-office manager from approve_office', () => {
    const invoice = makeInvoice({ status: 'awaiting_office_approval', office_location: 'clinic_seattle' });
    const omActor: Actor = { email: 'om@test.com' };
    expect(() => {
      transition(invoice, 'approve_office', omActor, { roles: ROLES });
    }).toThrow('RBAC');
  });
});
