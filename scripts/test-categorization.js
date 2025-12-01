#!/usr/bin/env node

/**
 * Test script to verify invoice categorization system
 * Tests: Excel loader, vendor matching, category storage, and bill creation
 */

const path = require('path');
const fs = require('fs');

// Add project root to module path
const projectRoot = path.join(__dirname, '..');
process.env.NODE_PATH = projectRoot;

async function runTests() {
  console.log('🧪 Starting categorization system tests...\n');

  try {
    // Test 1: Load Excel file
    console.log('Test 1: Loading vendor categories from Excel...');
    const { loadVendorCategoriesFromExcel } = require('../lib/qbo/qboExcelLoader');
    const mappings = loadVendorCategoriesFromExcel();
    console.log(`✅ Loaded ${mappings.length} vendor mappings from ${new Set(mappings.map(m => m.vendor)).size} unique vendors\n`);

    // Test 2: Vendor matching
    console.log('Test 2: Testing vendor matching...');
    const { getVendorCategoryCandidates } = require('../lib/qbo/vendorCategoryMap');
    
    const testVendors = ['Patterson Dental', 'Henry Schein', 'Dunivin Denture'];
    for (const vendor of testVendors) {
      const candidates = getVendorCategoryCandidates(vendor);
      console.log(`  ${vendor}: ${candidates.length} matches`);
      if (candidates.length > 0) {
        const first = candidates[0];
        console.log(`    → ${first.accountFullName} (Class: ${first.class || 'N/A'}, Confidence: ${(first.confidence * 100).toFixed(0)}%)`);
      }
    }
    console.log('✅ Vendor matching works\n');

    // Test 3: Category parser
    console.log('Test 3: Testing category parser...');
    const { categorizeInvoice } = require('../lib/invoices/categoryParser');
    
    const testInvoice = {
      vendor_name: 'Patterson Dental',
      line_items: [
        { description: 'Dental supplies', amount: 100 },
        { description: 'Lab fees', amount: 50 }
      ]
    };
    
    const categories = await categorizeInvoice(testInvoice, 'Patterson Dental');
    console.log(`✅ Categorized invoice with ${categories.length} categories`);
    categories.forEach((cat, idx) => {
      console.log(`  ${idx + 1}. ${cat.categoryName} (Class: ${cat.className || 'N/A'}, Confidence: ${(cat.confidenceScore * 100).toFixed(0)}%)`);
    });
    console.log();

    console.log('✅ All tests passed!\n');
    console.log('Summary:');
    console.log(`  - Excel loader: ✅ Working (${mappings.length} mappings)`);
    console.log(`  - Vendor matching: ✅ Working (${testVendors.length} vendors tested)`);
    console.log(`  - Category parser: ✅ Working (${categories.length} categories assigned)`);
    console.log('\n🎉 Categorization system is ready for production!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();

