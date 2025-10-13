import { mkdtempSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'pcs-workflow-test-'));
process.env.PCS_DATA_DIR = dataDir;

const roles = {
  admins: ['admin@example.com'],
  ap_authorizers: ['ap@example.com'],
  office_managers: {
    'Test Office': ['office.manager@example.com'],
  },
  threshold_usd: 1000,
  version: 1,
};

writeFileSync(path.join(dataDir, 'roles.json'), JSON.stringify(roles, null, 2));
writeFileSync(path.join(dataDir, 'invoice_queue.json'), JSON.stringify({ invoices: [] }, null, 2));

const { readRoles } = await import('../lib/workflow/rolesStore.ts');
const { approveAP, approveOffice, approveAdmin, markPaid } = await import('../lib/workflow/engine.ts');
const { save, getById } = await import('../lib/workflow/invoiceStore.ts');

const apUser = { email: 'ap@example.com', name: 'AP User' };
const officeUser = { email: 'office.manager@example.com', name: 'Office Manager' };
const adminUser = { email: 'admin@example.com', name: 'Admin User' };

const loadedRoles = await readRoles();
const threshold = loadedRoles.threshold_usd ?? 0;

let failures = 0;

function logStatus(step: string, status: string) {
  console.log(`${step}: ${status}`);
}

// Scenario 1: AP approves invoice without office
const invoiceNoOffice = {
  id: 'inv-no-office',
  invoice_number: 'INV-NO-OFFICE',
  vendor: 'Vendor One',
  total: 500,
  status: 'incoming',
};
await save(invoiceNoOffice);
const storedNoOffice = await getById('inv-no-office');
if (!storedNoOffice) {
  console.error('Failed to load invoice inv-no-office from store.');
  process.exit(1);
}
try {
  approveAP(storedNoOffice, apUser, loadedRoles);
  failures += 1;
  logStatus('[1] AP approval without office', 'FAILED (approval succeeded unexpectedly)');
} catch (error: any) {
  logStatus('[1] AP approval without office', `OK (error: ${error?.message || 'unknown'})`);
}

// Scenario 2: AP approves invoice below threshold -> awaiting_office_approval
const invoiceBelow = {
  id: 'inv-below-threshold',
  invoice_number: 'INV-LOW',
  vendor: 'Vendor Two',
  total: 500,
  office_location: 'Test Office',
  status: 'incoming',
};
await save(invoiceBelow);
const storedBelow = await getById('inv-below-threshold');
if (!storedBelow) {
  console.error('Failed to load invoice inv-below-threshold from store.');
  process.exit(1);
}
approveAP(storedBelow, apUser, loadedRoles);
await save(storedBelow);
logStatus('[2] AP approval below threshold', storedBelow.status);
if (storedBelow.status !== 'awaiting_office_approval') {
  failures += 1;
}

// Scenario 3: AP approves invoice above threshold -> awaiting_admin_approval
const invoiceAbove = {
  id: 'inv-above-threshold',
  invoice_number: 'INV-HIGH',
  vendor: 'Vendor Three',
  total: 5000,
  office_location: 'Test Office',
  status: 'incoming',
};
await save(invoiceAbove);
const storedAbove = await getById('inv-above-threshold');
if (!storedAbove) {
  console.error('Failed to load invoice inv-above-threshold from store.');
  process.exit(1);
}
approveAP(storedAbove, apUser, loadedRoles);
await save(storedAbove);
logStatus('[3] AP approval above threshold', storedAbove.status);
if (storedAbove.status !== 'awaiting_admin_approval') {
  failures += 1;
}

// Scenario 4a: Office approval after AP for invoice below threshold
approveOffice(storedBelow, officeUser, threshold);
await save(storedBelow);
logStatus('[4a] Office approval', storedBelow.status);
if (storedBelow.status !== 'to_be_paid') {
  failures += 1;
}

// Scenario 4b: Admin approval after AP for invoice above threshold
approveAdmin(storedAbove, adminUser);
await save(storedAbove);
logStatus('[4b] Admin approval', storedAbove.status);
if (storedAbove.status !== 'to_be_paid') {
  failures += 1;
}

// Scenario 5: Mark paid
markPaid(storedAbove, adminUser);
await save(storedAbove);
logStatus('[5] Mark paid', storedAbove.status);
if (storedAbove.status !== 'paid') {
  failures += 1;
}

console.log(`Test data directory: ${dataDir}`);

if (failures > 0) {
  console.error(`Workflow E2E tests FAILED with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Workflow E2E tests PASSED.');
