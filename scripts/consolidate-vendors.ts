#!/usr/bin/env npx ts-node

/**
 * Vendor Consolidation Script
 * 
 * This script consolidates duplicate vendor names in the database
 * by matching them to their canonical QBO vendor names.
 * 
 * Usage:
 *   npx ts-node scripts/consolidate-vendors.ts
 *   npx ts-node scripts/consolidate-vendors.ts --dry-run
 *   npx ts-node scripts/consolidate-vendors.ts --verbose
 */

import path from 'path';
import Database from 'better-sqlite3';

// Import vendor matcher functions
import { matchVendorToQBO, VendorMatchResult } from '../lib/invoices/vendorMatcher';

// Database path
const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'pcs_ui_data/pcs.db');
const QBO_TOKENS_DB_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db');

// Command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

interface VendorCount {
  vendor_name: string;
  count: number;
}

interface ConsolidationResult {
  original: string;
  mapped: string;
  method: string;
  confidence: number;
  invoiceCount: number;
}

/**
 * Fetch QBO vendors from the API or cache
 */
async function fetchQBOVendors(): Promise<string[]> {
  try {
    // Try to fetch from the QBO API
    const response = await fetch('https://pcsmilesai.com/api/qbo/vendors');
    if (response.ok) {
      const data = await response.json();
      if (data.vendors && Array.isArray(data.vendors)) {
        return data.vendors.map((v: any) => v.displayName);
      }
    }
  } catch (error) {
    console.log('Could not fetch from API, trying local...');
  }

  // Fallback: try to read from local QBO mappings file
  try {
    const mappingsPath = path.resolve(process.cwd(), 'pcs_ai_data/qbo_vendor_mappings.json');
    const fs = await import('fs');
    if (fs.existsSync(mappingsPath)) {
      const data = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'));
      if (data.vendors && Array.isArray(data.vendors)) {
        return data.vendors.map((v: any) => v.displayName || v.name);
      }
    }
  } catch (error) {
    console.log('Could not read local mappings file');
  }

  throw new Error('Could not fetch QBO vendors from any source');
}

/**
 * Get all unique vendor names from the database
 */
function getUniqueVendors(db: Database.Database): VendorCount[] {
  const query = `
    SELECT vendor_name, COUNT(*) as count 
    FROM invoices 
    WHERE deleted = 0 AND vendor_name IS NOT NULL AND vendor_name != ''
    GROUP BY vendor_name 
    ORDER BY count DESC
  `;
  return db.prepare(query).all() as VendorCount[];
}

/**
 * Update vendor names in the database
 */
function updateVendorName(db: Database.Database, oldName: string, newName: string): number {
  const stmt = db.prepare(`
    UPDATE invoices 
    SET vendor_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE vendor_name = ? AND deleted = 0
  `);
  const result = stmt.run(newName, oldName);
  return result.changes;
}

/**
 * Log consolidation to an audit table
 */
function logConsolidation(db: Database.Database, results: ConsolidationResult[]): void {
  // Ensure invoice_events table exists (it should already)
  db.prepare(`
    INSERT INTO invoice_events (invoice_id, action, payload_json)
    VALUES ('SYSTEM', 'VENDOR_CONSOLIDATION', ?)
  `).run(JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    mappings: results.map(r => ({
      original: r.original,
      mapped: r.mapped,
      method: r.method,
      confidence: r.confidence,
      invoiceCount: r.invoiceCount
    }))
  }));
}

/**
 * Main consolidation function
 */
async function consolidateVendors(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Vendor Consolidation Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log(`Database: ${DB_PATH}`);
  console.log('');

  // Open database
  const db = new Database(DB_PATH);
  
  try {
    // Fetch QBO vendors
    console.log('Fetching QBO vendor list...');
    const qboVendors = await fetchQBOVendors();
    console.log(`Found ${qboVendors.length} QBO vendors`);
    
    if (VERBOSE) {
      console.log('\nQBO Vendors (first 20):');
      qboVendors.slice(0, 20).forEach(v => console.log(`  - ${v}`));
      console.log('');
    }

    // Get unique vendors from database
    console.log('\nAnalyzing database vendors...');
    const dbVendors = getUniqueVendors(db);
    console.log(`Found ${dbVendors.length} unique vendor names in database`);

    // Build QBO vendor set for quick lookup
    const qboVendorSet = new Set(qboVendors.map(v => v.toLowerCase()));

    // Categorize vendors
    const alreadyCorrect: VendorCount[] = [];
    const needsMapping: { vendor: VendorCount; match: VendorMatchResult }[] = [];
    const noMatch: VendorCount[] = [];

    for (const vendor of dbVendors) {
      // Check if already an exact QBO vendor
      if (qboVendorSet.has(vendor.vendor_name.toLowerCase())) {
        // Find the correct casing
        const correctVendor = qboVendors.find(
          qbo => qbo.toLowerCase() === vendor.vendor_name.toLowerCase()
        );
        if (correctVendor && correctVendor !== vendor.vendor_name) {
          // Case mismatch - needs update
          needsMapping.push({
            vendor,
            match: { match: correctVendor, confidence: 0.99, method: 'exact_normalized' }
          });
        } else {
          alreadyCorrect.push(vendor);
        }
        continue;
      }

      // Try to match to QBO
      const match = matchVendorToQBO(vendor.vendor_name, qboVendors);
      
      if (match.match && match.confidence >= 0.5) {
        needsMapping.push({ vendor, match });
      } else {
        noMatch.push(vendor);
      }
    }

    // Report
    console.log('\n' + '='.repeat(60));
    console.log('Analysis Results');
    console.log('='.repeat(60));
    console.log(`Already correct: ${alreadyCorrect.length} vendors`);
    console.log(`Needs mapping: ${needsMapping.length} vendors`);
    console.log(`No match found: ${noMatch.length} vendors`);

    // Show mappings
    if (needsMapping.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Vendor Mappings to Apply:');
      console.log('-'.repeat(60));
      
      const results: ConsolidationResult[] = [];
      
      for (const { vendor, match } of needsMapping) {
        const result: ConsolidationResult = {
          original: vendor.vendor_name,
          mapped: match.match!,
          method: match.method,
          confidence: match.confidence,
          invoiceCount: vendor.count
        };
        results.push(result);
        
        console.log(`\n  "${vendor.vendor_name}" (${vendor.count} invoices)`);
        console.log(`    → "${match.match}" [${match.method}, conf: ${(match.confidence * 100).toFixed(0)}%]`);
      }

      // Apply changes if not dry run
      if (!DRY_RUN) {
        console.log('\n' + '='.repeat(60));
        console.log('Applying Changes...');
        console.log('='.repeat(60));

        let totalUpdated = 0;
        for (const { vendor, match } of needsMapping) {
          const updated = updateVendorName(db, vendor.vendor_name, match.match!);
          totalUpdated += updated;
          console.log(`  Updated ${updated} invoices: "${vendor.vendor_name}" → "${match.match}"`);
        }

        // Log to audit
        logConsolidation(db, results);

        console.log(`\nTotal invoices updated: ${totalUpdated}`);
      } else {
        console.log('\n[DRY RUN] No changes made. Run without --dry-run to apply changes.');
      }
    }

    // Show unmatched vendors
    if (noMatch.length > 0 && VERBOSE) {
      console.log('\n' + '-'.repeat(60));
      console.log('Vendors with No QBO Match:');
      console.log('-'.repeat(60));
      for (const vendor of noMatch) {
        console.log(`  - "${vendor.vendor_name}" (${vendor.count} invoices)`);
      }
    } else if (noMatch.length > 0) {
      console.log(`\nNote: ${noMatch.length} vendors have no QBO match. Use --verbose to see them.`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    const totalInvoicesMapped = needsMapping.reduce((sum, m) => sum + m.vendor.count, 0);
    console.log(`Vendors mapped: ${needsMapping.length}`);
    console.log(`Invoices affected: ${totalInvoicesMapped}`);
    console.log(`Vendors unmatched: ${noMatch.length}`);

  } finally {
    db.close();
  }
}

// Run the script
consolidateVendors()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nError:', error.message);
    process.exit(1);
  });
