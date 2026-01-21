#!/usr/bin/env npx ts-node

/**
 * Initial Training Script for GPT-4o Knowledge Base System
 * 
 * This script generates initial knowledge base prompts for each vendor
 * by analyzing sample invoice PDFs and existing parsed JSON data.
 * 
 * Usage:
 *   npx ts-node scripts/initial-training.ts
 *   npx ts-node scripts/initial-training.ts --vendor "Henry Schein"
 *   npx ts-node scripts/initial-training.ts --dry-run
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

// Directories to search for invoice PDFs
const PDF_DIRECTORIES = [
  'sample_invoices_pcs',
  'email_invoices',
  'pcs_ui_data/email_invoices',
];

// Directory with parsed JSON files
const JSON_DIRECTORY = 'output_jsons';

interface VendorInvoices {
  vendorName: string;
  pdfPaths: string[];
  jsonPaths: string[];
}

interface TrainingResult {
  vendorName: string;
  success: boolean;
  knowledgePrompt?: string;
  error?: string;
  pdfCount: number;
  jsonCount: number;
}

/**
 * Find all invoice PDFs grouped by vendor
 */
function findInvoicesByVendor(): Map<string, VendorInvoices> {
  const vendorMap = new Map<string, VendorInvoices>();
  const cwd = process.cwd();

  // Search PDF directories
  for (const dir of PDF_DIRECTORIES) {
    const fullDir = path.join(cwd, dir);
    if (!fs.existsSync(fullDir)) continue;

    // Check for vendor subdirectories (like sample_invoices_pcs/Henry_Schein/)
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Vendor subdirectory
        const vendorDir = path.join(fullDir, entry.name);
        const vendorName = entry.name.replace(/_/g, ' ');
        
        const pdfs = fs.readdirSync(vendorDir)
          .filter(f => f.toLowerCase().endsWith('.pdf'))
          .map(f => path.join(vendorDir, f));
        
        if (pdfs.length > 0) {
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, { vendorName, pdfPaths: [], jsonPaths: [] });
          }
          vendorMap.get(vendorName)!.pdfPaths.push(...pdfs);
        }
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        // PDF in root directory - try to detect vendor from filename
        const vendorName = detectVendorFromFilename(entry.name);
        if (vendorName) {
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, { vendorName, pdfPaths: [], jsonPaths: [] });
          }
          vendorMap.get(vendorName)!.pdfPaths.push(path.join(fullDir, entry.name));
        }
      }
    }
  }

  // Search JSON directory for parsed invoices
  const jsonDir = path.join(cwd, JSON_DIRECTORY);
  if (fs.existsSync(jsonDir)) {
    const jsonFiles = fs.readdirSync(jsonDir)
      .filter(f => f.endsWith('.json'));
    
    for (const jsonFile of jsonFiles) {
      try {
        const jsonPath = path.join(jsonDir, jsonFile);
        const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const vendorName = content.vendor || content.vendor_name;
        
        if (vendorName) {
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, { vendorName, pdfPaths: [], jsonPaths: [] });
          }
          vendorMap.get(vendorName)!.jsonPaths.push(jsonPath);
        }
      } catch {
        // Skip invalid JSON files
      }
    }
  }

  return vendorMap;
}

/**
 * Detect vendor name from filename
 */
function detectVendorFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  
  const vendorPatterns: Record<string, string> = {
    'henry': 'Henry Schein',
    'schein': 'Henry Schein',
    'patterson': 'Patterson Dental',
    'epic': 'Epic Dental Lab',
    'exodus': 'Exodus Dental Solutions',
    'artisan': 'Artisan Dental',
    'tc_dental': 'TC Dental Lab',
    'darby': 'Darby Dental Supply',
    'dandy': 'Dandy',
    'brasseler': 'Brasseler',
  };

  for (const [pattern, vendor] of Object.entries(vendorPatterns)) {
    if (lower.includes(pattern)) {
      return vendor;
    }
  }

  return null;
}

/**
 * Convert PDF to base64 images using system pdftoppm
 */
async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  const { execSync } = await import('child_process');
  const os = await import('os');
  
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
  const outputPrefix = path.join(tempDir, 'page');

  try {
    execSync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`, {
      timeout: 60000,
      stdio: 'pipe'
    });

    const files = fs.readdirSync(tempDir)
      .filter(f => f.endsWith('.png'))
      .sort();

    const base64Images: string[] = [];
    for (const file of files) {
      const imagePath = path.join(tempDir, file);
      const buffer = fs.readFileSync(imagePath);
      base64Images.push(buffer.toString('base64'));
    }

    return base64Images;
  } finally {
    // Cleanup
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Format images for OpenAI API
 */
function formatImagesForOpenAI(base64Images: string[]): Array<{
  type: 'image_url';
  image_url: { url: string; detail: 'high' | 'low' };
}> {
  return base64Images.map(base64 => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/png;base64,${base64}`,
      detail: 'high' as const
    }
  }));
}

/**
 * Generate knowledge base prompt for a vendor using GPT-4o
 */
async function generateKnowledgeBase(vendor: VendorInvoices): Promise<TrainingResult> {
  console.log(`\n📚 Training knowledge base for: ${vendor.vendorName}`);
  console.log(`   PDFs: ${vendor.pdfPaths.length}, JSONs: ${vendor.jsonPaths.length}`);

  try {
    // Collect sample data
    const sampleJsons: any[] = [];
    for (const jsonPath of vendor.jsonPaths.slice(0, 3)) {
      try {
        sampleJsons.push(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
      } catch {
        // Skip invalid JSONs
      }
    }

    // Convert sample PDFs to images (max 2 PDFs, 2 pages each)
    const allImages: string[] = [];
    for (const pdfPath of vendor.pdfPaths.slice(0, 2)) {
      try {
        console.log(`   Converting: ${path.basename(pdfPath)}`);
        const images = await convertPdfToImages(pdfPath);
        allImages.push(...images.slice(0, 2)); // Max 2 pages per PDF
      } catch (err: any) {
        console.log(`   ⚠️ Could not convert ${path.basename(pdfPath)}: ${err.message}`);
      }
    }

    if (allImages.length === 0 && sampleJsons.length === 0) {
      return {
        vendorName: vendor.vendorName,
        success: false,
        error: 'No sample data available',
        pdfCount: vendor.pdfPaths.length,
        jsonCount: vendor.jsonPaths.length
      };
    }

    // Build the training prompt
    const trainingPrompt = `You are creating a knowledge base prompt for parsing invoices from "${vendor.vendorName}".

${sampleJsons.length > 0 ? `EXISTING PARSED DATA (for reference - may contain errors):
${JSON.stringify(sampleJsons.slice(0, 2), null, 2)}` : ''}

INVOICE IMAGES ARE ATTACHED (if available).

Analyze these invoices and create a detailed knowledge base prompt that will help GPT-4o accurately parse future invoices from this vendor. Your response should be a complete prompt that includes:

1. VENDOR IDENTIFICATION
   - How to identify this is a ${vendor.vendorName} invoice
   - Unique visual elements, logos, or text patterns

2. FIELD LOCATIONS AND PATTERNS
   - Where to find the invoice number (patterns, location on page)
   - Where to find dates (invoice date, due date)
   - Where to find the total amount
   - Where to find ship-to/office location
   - Any unique formatting this vendor uses

3. LINE ITEM PARSING
   - How line items are formatted
   - Column headers to look for
   - How to extract description, quantity, price, and amount

4. SPECIAL CONSIDERATIONS
   - Any quirks or edge cases for this vendor
   - Multi-page invoice handling
   - Credit memos or adjustments

Return ONLY the knowledge base prompt text. Do not include any explanation or preamble.
Start with: "You are parsing invoices from ${vendor.vendorName}."`;

    console.log(`   Calling GPT-4o with ${allImages.length} image(s)...`);

    const messages: any[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: trainingPrompt },
          ...formatImagesForOpenAI(allImages)
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 3000,
      temperature: 0.3,
      messages
    });

    const knowledgePrompt = response.choices[0]?.message?.content?.trim();

    if (!knowledgePrompt || knowledgePrompt.length < 100) {
      return {
        vendorName: vendor.vendorName,
        success: false,
        error: 'GPT returned empty or too short response',
        pdfCount: vendor.pdfPaths.length,
        jsonCount: vendor.jsonPaths.length
      };
    }

    console.log(`   ✅ Generated ${knowledgePrompt.length} character knowledge base`);

    return {
      vendorName: vendor.vendorName,
      success: true,
      knowledgePrompt,
      pdfCount: vendor.pdfPaths.length,
      jsonCount: vendor.jsonPaths.length
    };

  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      vendorName: vendor.vendorName,
      success: false,
      error: error.message,
      pdfCount: vendor.pdfPaths.length,
      jsonCount: vendor.jsonPaths.length
    };
  }
}

/**
 * Save knowledge base to database via API
 */
async function saveKnowledgeBase(vendorName: string, knowledgePrompt: string): Promise<boolean> {
  try {
    // Since we're running as a script, we'll write directly to a JSON file
    // that can be imported later, or you can modify this to call the API
    const outputDir = path.join(process.cwd(), 'pcs_ui_data', 'knowledge_bases');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = vendorName.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, JSON.stringify({
      vendor_name: vendorName,
      knowledge_prompt: knowledgePrompt,
      generated_at: new Date().toISOString()
    }, null, 2));

    console.log(`   💾 Saved to ${outputPath}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Failed to save: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 GPT-4o Knowledge Base Initial Training Script');
  console.log('=' .repeat(50));

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const vendorFilter = args.includes('--vendor') 
    ? args[args.indexOf('--vendor') + 1] 
    : null;

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be saved\n');
  }

  // Find all vendors with invoices
  console.log('\n📂 Scanning for invoice files...');
  const vendorMap = findInvoicesByVendor();

  console.log(`\nFound ${vendorMap.size} vendors:`);
  for (const [name, data] of vendorMap) {
    console.log(`  - ${name}: ${data.pdfPaths.length} PDFs, ${data.jsonPaths.length} JSONs`);
  }

  // Filter if specific vendor requested
  let vendorsToProcess: VendorInvoices[] = Array.from(vendorMap.values());
  if (vendorFilter) {
    vendorsToProcess = vendorsToProcess.filter(v => 
      v.vendorName.toLowerCase().includes(vendorFilter.toLowerCase())
    );
    console.log(`\nFiltered to ${vendorsToProcess.length} vendor(s) matching "${vendorFilter}"`);
  }

  if (vendorsToProcess.length === 0) {
    console.log('\n❌ No vendors found to process');
    process.exit(1);
  }

  // Process each vendor
  const results: TrainingResult[] = [];
  
  for (const vendor of vendorsToProcess) {
    // Only process vendors that have at least 1 PDF
    if (vendor.pdfPaths.length === 0) {
      console.log(`\n⏭️ Skipping ${vendor.vendorName} - no PDFs available`);
      continue;
    }

    const result = await generateKnowledgeBase(vendor);
    results.push(result);

    if (result.success && result.knowledgePrompt && !dryRun) {
      await saveKnowledgeBase(result.vendorName, result.knowledgePrompt);
    }

    // Small delay between vendors to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 TRAINING SUMMARY');
  console.log('=' .repeat(50));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}`);
  for (const r of successful) {
    console.log(`   - ${r.vendorName}`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    for (const r of failed) {
      console.log(`   - ${r.vendorName}: ${r.error}`);
    }
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN complete - no changes were saved');
  } else {
    console.log(`\n💾 Knowledge bases saved to: pcs_ui_data/knowledge_bases/`);
    console.log('   Import them via the admin UI or run the import script');
  }
}

// Run
main().catch(console.error);
