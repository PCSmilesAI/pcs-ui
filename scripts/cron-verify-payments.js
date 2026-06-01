#!/usr/bin/env node
/**
 * Payment Verification Cron Job
 *
 * Runs every 15 minutes via PM2 cron.
 * Calls the internal API to check QBO bill balances and auto-mark
 * paid invoices as 'paid' in the database.
 *
 * PM2 config: see ecosystem.config.js
 * Manual run: node scripts/cron-verify-payments.js
 */

const CRON_SECRET = process.env.CRON_SECRET || 'pcs-cron-verify-2024';
const BASE_URL = process.env.PCS_BASE_URL || 'http://localhost:3000';

async function run() {
  const url = `${BASE_URL}/api/invoices/cron-verify-payments?secret=${CRON_SECRET}`;
  console.log(`[CRON] ${new Date().toISOString()} — Verifying QBO payments...`);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      console.error('[CRON] Verification failed:', data.error);
      process.exit(1);
    }

    console.log(`[CRON] Checked ${data.checked} invoices — ${data.paid.length} newly paid, ${data.unpaid.length} still pending`);
    if (data.errors.length > 0) {
      console.warn(`[CRON] ${data.errors.length} errors:`, data.errors.slice(0, 5).join('; '));
    }
    console.log(`[CRON] Completed in ${data.elapsed_ms}ms`);
  } catch (err) {
    console.error('[CRON] Failed to reach PCS API:', err.message);
    process.exit(1);
  }
}

run();
