#!/usr/bin/env node
/**
 * Reparse Failed Invoices Script
 * 
 * Calls the reparse API endpoint for all invoices that are in 'failed' or 'partial' status.
 * Uses the vendor knowledge base prompts for improved parsing.
 * 
 * Usage:
 *   node scripts/reparse-failed-invoices.js [options]
 * 
 * Options:
 *   --limit=N      Only process N invoices
 *   --delay=MS     Delay between API calls (default: 3000ms)
 *   --dry-run      Show what would be done without actually doing it
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
let limit = null;
let delay = 3000;
let dryRun = false;

for (const arg of args) {
  if (arg.startsWith('--limit=')) {
    limit = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--delay=')) {
    delay = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--dry-run') {
    dryRun = true;
  }
}

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

console.log('='.repeat(60));
console.log('REPARSE FAILED INVOICES');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`API URL: ${API_BASE_URL}`);
console.log(`Delay: ${delay}ms`);
if (limit) console.log(`Limit: ${limit}`);
if (dryRun) console.log('DRY RUN MODE');
console.log('='.repeat(60));
console.log();

// Connect to database
const db = new Database(DB_PATH, { readonly: true });

// Get invoices that need reparsing
const query = `
  SELECT 
    id, 
    vendor_name, 
    invoice_number, 
    source_file,
    pdf_path,
    parsing_status,
    parsing_error,
    amount_cents,
    invoice_date
  FROM invoices 
  WHERE deleted = 0 
    AND (
      parsing_status IN ('failed', 'partial')
      OR (
        (amount_cents IS NULL OR amount_cents = 0)
        AND parsing_status != 'success'
      )
      OR (
        (invoice_date IS NULL OR invoice_date = '')
        AND parsing_status != 'success'
      )
    )
    AND (source_file IS NOT NULL AND source_file != '')
  ORDER BY 
    CASE parsing_status 
      WHEN 'failed' THEN 1 
      WHEN 'partial' THEN 2 
      ELSE 3 
    END
  ${limit ? `LIMIT ${limit}` : ''}
`;

const invoices = db.prepare(query).all();
console.log(`Found ${invoices.length} invoices to reparse`);
console.log();

if (invoices.length === 0) {
  console.log('No invoices need reparsing!');
  process.exit(0);
}

// Show breakdown by status
const statusCounts = {};
for (const inv of invoices) {
  const status = inv.parsing_status || 'unknown';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}
console.log('Status breakdown:');
for (const [status, count] of Object.entries(statusCounts)) {
  console.log(`  ${status}: ${count}`);
}
console.log();

// Show sample invoices
console.log('Sample invoices to reparse:');
for (const inv of invoices.slice(0, 5)) {
  console.log(`  - ${inv.vendor_name || 'Unknown'} | ${inv.invoice_number} | ${inv.parsing_status}`);
  if (inv.parsing_error) {
    console.log(`    Error: ${inv.parsing_error}`);
  }
}
if (invoices.length > 5) {
  console.log(`  ... and ${invoices.length - 5} more`);
}
console.log();

if (dryRun) {
  console.log('[DRY RUN] No changes will be made');
  console.log('[DRY RUN] Run without --dry-run to actually reparse');
  process.exit(0);
}

// Function to make HTTP request to reparse endpoint
function reparseInvoice(invoiceId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE_URL}/api/invoices/${invoiceId}/reparse`);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      rejectUnauthorized: false // Allow self-signed certs
    };
    
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main processing loop
async function main() {
  let successful = 0;
  let failed = 0;
  let partial = 0;
  const errors = [];
  
  console.log('Starting reparse...');
  console.log('Press Ctrl+C to stop');
  console.log();
  
  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    const progress = `[${i + 1}/${invoices.length}]`;
    
    process.stdout.write(`${progress} Reparsing ${invoice.vendor_name || 'Unknown'} (${invoice.invoice_number})... `);
    
    try {
      const result = await reparseInvoice(invoice.id);
      
      if (result.statusCode === 200 && result.data.ok) {
        const status = result.data.parsing_status;
        if (status === 'success') {
          successful++;
          console.log(`✓ Success (${result.data.amount || 'no amount'})`);
        } else if (status === 'partial') {
          partial++;
          console.log(`◐ Partial (${result.data.parsing_error || 'incomplete'})`);
        } else {
          failed++;
          console.log(`✗ ${status}`);
        }
      } else {
        failed++;
        const errMsg = result.data?.error || `HTTP ${result.statusCode}`;
        console.log(`✗ ${errMsg}`);
        errors.push({ invoice: invoice.invoice_number, error: errMsg });
      }
    } catch (err) {
      failed++;
      console.log(`✗ ${err.message}`);
      errors.push({ invoice: invoice.invoice_number, error: err.message });
    }
    
    // Delay between requests
    if (i < invoices.length - 1) {
      await sleep(delay);
    }
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('REPARSE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total: ${invoices.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Partial: ${partial}`);
  console.log(`Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log();
    console.log('Errors:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err.invoice}: ${err.error}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
