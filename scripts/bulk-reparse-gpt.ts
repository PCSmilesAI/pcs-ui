#!/usr/bin/env npx ts-node
/**
 * Bulk Reparse Script
 * 
 * Reparses all invoices from email_invoices/ using PCS AI.
 * 
 * Usage:
 *   npx ts-node scripts/bulk-reparse-gpt.ts [options]
 * 
 * Options:
 *   --wipe         Wipe existing data before starting (required for fresh start)
 *   --resume       Resume from where we left off (skip already-parsed files)
 *   --limit=N      Only process N files (for testing)
 *   --delay=MS     Delay between parses in milliseconds (default: 2500)
 *   --dry-run      Show what would be done without actually doing it
 *   --help         Show this help message
 */

import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
import 'dotenv/config';

// Import after dotenv
import { fullWipe, getDatabaseStats } from '../lib/db/wipe';
import { 
  runBulkParse, 
  scanForPDFs, 
  estimateBulkParseTime,
  loadProgress,
  clearProgress,
  BulkParseProgress 
} from '../lib/gpt/bulkParse';
import { testGPTConnection } from '../lib/gpt/parseInvoice';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIOptions {
  wipe: boolean;
  resume: boolean;
  limit: number | undefined;
  delay: number;
  dryRun: boolean;
  highQuality: boolean;
  maxRetries: number;
  noHistory: boolean;
  classifyFirst: boolean;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    wipe: false,
    resume: false,
    limit: undefined,
    delay: 2500,
    dryRun: false,
    highQuality: false,
    maxRetries: 3,
    noHistory: false,
    classifyFirst: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--wipe') options.wipe = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--high-quality') options.highQuality = true;
    else if (arg === '--no-history') options.noHistory = true;
    else if (arg === '--classify') options.classifyFirst = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--limit=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) options.limit = val;
    }
    else if (arg.startsWith('--delay=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) options.delay = val;
    }
    else if (arg.startsWith('--max-retries=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) options.maxRetries = val;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Bulk Reparse Script - Parse all invoices with PCS AI

Usage:
  npx ts-node scripts/bulk-reparse-gpt.ts [options]

Options:
  --wipe           Wipe existing invoice data before starting
                   (required for a fresh start)
  --resume         Resume from where we left off (skip already-parsed files)
  --limit=N        Only process N files (useful for testing)
  --delay=MS       Delay between parses in milliseconds (default: 2500)
  --high-quality   Use 'auto' image detail level for better accuracy on complex PDFs
  --max-retries=N  Max retry attempts per file (default: 3)
  --no-history     Skip historical examples (reduces context size)
  --classify       Classify documents first; route non-invoices to Other Documents
  --dry-run        Show what would be done without actually doing it
  --help, -h       Show this help message

Examples:
  # Fresh start - wipe everything and reparse all
  npx tsx scripts/bulk-reparse-gpt.ts --wipe

  # High-quality reparse with classification (recommended)
  npx tsx scripts/bulk-reparse-gpt.ts --wipe --high-quality --max-retries=3 --classify

  # Test with 10 files first
  npx tsx scripts/bulk-reparse-gpt.ts --wipe --limit=10

  # Resume after interruption
  npx tsx scripts/bulk-reparse-gpt.ts --resume

  # Dry run to see what would happen
  npx tsx scripts/bulk-reparse-gpt.ts --wipe --dry-run
`);
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('BULK REPARSE SCRIPT - PCS AI');
  console.log('='.repeat(60));
  console.log();

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in .env.local or export it');
    process.exit(1);
  }

  // Test PCS AI connection
  console.log('Testing PCS AI connection...');
  const gptTest = await testGPTConnection();
  if (!gptTest.connected) {
    console.error(`ERROR: Cannot connect to PCS AI: ${gptTest.error}`);
    process.exit(1);
  }
  console.log(`Connected to ${gptTest.model}`);
  console.log();

  // Find PDF directory
  const emailInvoicesDir = path.join(process.cwd(), 'email_invoices');
  if (!fs.existsSync(emailInvoicesDir)) {
    console.error(`ERROR: email_invoices directory not found at ${emailInvoicesDir}`);
    process.exit(1);
  }

  // Scan for PDFs
  const pdfFiles = scanForPDFs(emailInvoicesDir);
  const filesToProcess = options.limit ? Math.min(pdfFiles.length, options.limit) : pdfFiles.length;
  
  console.log(`Found ${pdfFiles.length} PDF files`);
  if (options.limit) {
    console.log(`Limiting to ${options.limit} files`);
  }
  console.log();

  // Estimate time
  const estimate = estimateBulkParseTime(filesToProcess, options.delay);
  console.log(`Estimated time: ${estimate.formatted}`);
  console.log(`Delay between parses: ${options.delay}ms`);
  console.log(`High-quality mode: ${options.highQuality ? 'YES (auto detail)' : 'NO (low detail)'}`);
  console.log(`Max retries per file: ${options.maxRetries}`);
  console.log(`Skip history: ${options.noHistory ? 'YES' : 'NO'}`);
  console.log(`Classify first: ${options.classifyFirst ? 'YES (route non-invoices to Other Documents)' : 'NO'}`);
  console.log();

  // Show current database stats
  console.log('Current database stats:');
  const stats = getDatabaseStats();
  for (const [table, count] of Object.entries(stats)) {
    if (count > 0) {
      console.log(`  ${table}: ${count} records`);
    }
  }
  console.log();

  // Check existing progress
  const existingProgress = loadProgress();
  if (existingProgress && !options.wipe) {
    console.log('Previous progress found:');
    console.log(`  Processed: ${existingProgress.processed}/${existingProgress.total}`);
    console.log(`  Successful: ${existingProgress.successful}`);
    console.log(`  Failed: ${existingProgress.failed}`);
    console.log(`  Started: ${existingProgress.startedAt}`);
    if (existingProgress.isRunning) {
      console.log('  Status: WAS INTERRUPTED');
    }
    console.log();

    if (!options.resume) {
      console.log('Use --resume to continue from where we left off, or --wipe to start fresh');
      process.exit(1);
    }
  }

  // Handle wipe
  if (options.wipe) {
    if (!options.resume && filesToProcess > 0) {
      console.log('WARNING: This will wipe all existing invoice data!');
      console.log();
      
      if (options.dryRun) {
        console.log('[DRY RUN] Would wipe:');
        const wipeResult = fullWipe({ keepKnowledgeBases: true, dryRun: true });
        console.log();
      } else {
        // Prompt for confirmation
        console.log('Wiping database in 5 seconds... (Ctrl+C to cancel)');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('Wiping database...');
        const wipeResult = fullWipe({ keepKnowledgeBases: true });
        if (!wipeResult.success) {
          console.error('ERROR: Failed to wipe database');
          process.exit(1);
        }
        console.log('Database wiped successfully');
        console.log();
        
        // Clear progress file
        clearProgress();
      }
    }
  }

  // Dry run - show what would happen and exit
  if (options.dryRun) {
    console.log('[DRY RUN] Would process:');
    const sample = pdfFiles.slice(0, Math.min(10, filesToProcess));
    for (const file of sample) {
      console.log(`  - ${path.basename(file)}`);
    }
    if (filesToProcess > 10) {
      console.log(`  ... and ${filesToProcess - 10} more files`);
    }
    console.log();
    console.log('[DRY RUN] No changes made');
    process.exit(0);
  }

  // Run bulk parse
  console.log('Starting bulk parse...');
  console.log('Press Ctrl+C to stop (progress will be saved)');
  console.log();

  // Handle Ctrl+C gracefully
  let interrupted = false;
  process.on('SIGINT', () => {
    if (!interrupted) {
      interrupted = true;
      console.log('\nInterrupted! Saving progress...');
      // Progress is saved automatically after each file
      process.exit(0);
    }
  });

  try {
    const result = await runBulkParse(emailInvoicesDir, {
      delayMs: options.delay,
      resume: options.resume,
      limit: options.limit,
      highQuality: options.highQuality,
      maxRetries: options.maxRetries,
      noHistory: options.noHistory,
      classifyFirst: options.classifyFirst,
      onProgress: (progress: BulkParseProgress) => {
        // Progress is logged in runBulkParse
      },
    });

    console.log();
    console.log('='.repeat(60));
    console.log('BULK PARSE COMPLETE');
    console.log('='.repeat(60));
    console.log();
    console.log(`Total files: ${result.total}`);
    console.log(`Processed: ${result.processed}`);
    console.log(`Successful: ${result.successful}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log();
    console.log(`Started: ${result.startedAt}`);
    console.log(`Finished: ${result.lastUpdated}`);

    if (result.errors.length > 0) {
      console.log();
      console.log(`Errors (${result.errors.length}):`);
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  - ${err.file}: ${err.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

  } catch (error: any) {
    console.error('FATAL ERROR:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
