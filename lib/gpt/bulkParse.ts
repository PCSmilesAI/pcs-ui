/**
 * Bulk Parse Library
 * 
 * Shared logic for bulk reparsing operations using GPT-5 nano.
 * Used by both CLI script and API endpoints.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseInvoiceWithGPT, ParseResult, PARSING_CONFIG } from './parseInvoice';
import { getOrCreateKnowledgeBase } from './knowledgeBase';
import { getDatabase } from '../db/client';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface BulkParseProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  currentFile: string | null;
  startedAt: string;
  lastUpdated: string;
  errors: Array<{ file: string; error: string }>;
  isRunning: boolean;
}

export interface BulkParseOptions {
  delayMs?: number;           // Delay between parses (default: 2500ms)
  resume?: boolean;           // Skip already-parsed files
  limit?: number;             // Max files to process (for testing)
  highQuality?: boolean;      // Use 'auto' detail level instead of 'low' for better accuracy
  maxRetries?: number;        // Max retries per file (default: 3)
  noHistory?: boolean;        // Skip historical examples (reduce context size)
  onProgress?: (progress: BulkParseProgress) => void;
  onParsed?: (file: string, result: ParseResult) => void;
}

export interface ParsedInvoiceRecord {
  id: string;
  invoice_number: string;
  source_file: string;
  vendor_name: string | null;
  parsed_vendor_name: string | null;
  office_location: string | null;
  parsed_office_id: string | null;
  total: number | null;
  parsed_amount_cents: number | null;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  parsing_method: string;
  parsing_confidence: number;
  parsing_error: string | null;
  line_items: string | null;  // JSON string
  pdf_path: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Progress File Management
// ============================================================================

const PROGRESS_FILE = path.join(process.cwd(), 'bulk_parse_progress.json');

export function loadProgress(): BulkParseProgress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function saveProgress(progress: BulkParseProgress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (err: any) {
    console.error('[BULK] Failed to save progress:', err.message);
  }
}

export function clearProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  } catch {
    // Ignore
  }
}

/**
 * Remove files from the failed tracking list
 * Called when previously failed invoices are successfully re-parsed
 * 
 * @param filenames - Array of filenames to remove from the errors list
 * @returns Number of entries removed
 */
export function removeFromFailedTracking(filenames: string[]): number {
  const progress = loadProgress();
  if (!progress) {
    console.log('[BULK] No progress file found, nothing to remove');
    return 0;
  }

  const fileSet = new Set(filenames.map(f => path.basename(f).toLowerCase()));
  const originalCount = progress.errors.length;

  // Filter out the files that have been fixed
  progress.errors = progress.errors.filter(err => {
    const errFile = path.basename(err.file).toLowerCase();
    return !fileSet.has(errFile);
  });

  const removedCount = originalCount - progress.errors.length;

  if (removedCount > 0) {
    // Update the counters
    progress.failed = progress.failed - removedCount;
    progress.successful = progress.successful + removedCount;
    progress.lastUpdated = new Date().toISOString();
    
    saveProgress(progress);
    console.log(`[BULK] Removed ${removedCount} entries from failed tracking`);
  }

  return removedCount;
}

/**
 * Get list of failed files from progress tracking
 */
export function getFailedFiles(): string[] {
  const progress = loadProgress();
  if (!progress) {
    return [];
  }
  return progress.errors.map(err => err.file);
}

// ============================================================================
// PDF Discovery
// ============================================================================

/**
 * Scan a directory for PDF files
 */
export function scanForPDFs(directory: string): string[] {
  const pdfs: string[] = [];
  
  if (!fs.existsSync(directory)) {
    console.error(`[BULK] Directory not found: ${directory}`);
    return pdfs;
  }

  const files = fs.readdirSync(directory);
  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      pdfs.push(path.join(directory, file));
    }
  }

  // Sort for consistent ordering
  pdfs.sort();
  
  console.log(`[BULK] Found ${pdfs.length} PDF files in ${directory}`);
  return pdfs;
}

/**
 * Get list of already-parsed PDF paths from database
 */
export function getAlreadyParsedFiles(): Set<string> {
  const db = getDatabase();
  const parsed = new Set<string>();
  
  try {
    const rows = db.prepare('SELECT pdf_path, source_file FROM invoices').all() as Array<{ pdf_path: string; source_file: string }>;
    for (const row of rows) {
      if (row.pdf_path) parsed.add(row.pdf_path);
      if (row.source_file) parsed.add(row.source_file);
      // Also add just the filename for matching
      if (row.pdf_path) parsed.add(path.basename(row.pdf_path));
      if (row.source_file) parsed.add(path.basename(row.source_file));
    }
  } catch {
    // Table might not exist yet
  }
  
  return parsed;
}

// ============================================================================
// Invoice Saving
// ============================================================================

/**
 * Save a parsed invoice to the database
 */
export function saveParsedInvoice(
  pdfPath: string,
  result: ParseResult
): { success: boolean; invoiceId?: string; error?: string } {
  const db = getDatabase();
  
  try {
    const data = result.data;
    const invoiceId = uuidv4();
    
    // Generate invoice number if not parsed
    let invoiceNumber = data?.invoice_number;
    if (!invoiceNumber) {
      // Use filename + timestamp as fallback
      const baseName = path.basename(pdfPath, path.extname(pdfPath));
      invoiceNumber = `AI-${baseName}-${Date.now()}`.substring(0, 100);
    }

    // Check for duplicate invoice number
    const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber);
    if (existing) {
      // Append unique suffix
      invoiceNumber = `${invoiceNumber}-${Date.now()}`;
    }

    const totalCents = data?.total ? Math.round(data.total * 100) : null;

    const stmt = db.prepare(`
      INSERT INTO invoices (
        id,
        invoice_number,
        source_file,
        pdf_path,
        vendor_name,
        parsed_vendor_name,
        office_location,
        parsed_office_id,
        total,
        invoice_total,
        parsed_amount_cents,
        amount_cents,
        invoice_date,
        due_date,
        status,
        parsing_method,
        parsing_confidence,
        parsing_error,
        description,
        deleted,
        created_at,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    // Store line items as description JSON for now (description field exists)
    const lineItemsDescription = data?.line_items && data.line_items.length > 0
      ? `Line items: ${JSON.stringify(data.line_items)}`
      : null;

    stmt.run(
      invoiceId,
      invoiceNumber,
      pdfPath,
      pdfPath,
      data?.vendor_name || result.vendorDetected || null,
      data?.vendor_name || result.vendorDetected || null,
      data?.office_location || null,
      data?.office_location || null,
      data?.total || null,
      data?.total || null,
      totalCents,
      totalCents,
      data?.invoice_date || null,
      data?.due_date || null,
      'pending_review',  // New status for AI-parsed invoices
      'gpt-5-nano',
      data?.parsing_confidence || 0.5,
      result.success ? null : result.error,
      lineItemsDescription,
      0,  // not deleted
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Ensure knowledge base exists for this vendor
    if (data?.vendor_name || result.vendorDetected) {
      const vendorName = data?.vendor_name || result.vendorDetected || 'Unknown';
      getOrCreateKnowledgeBase(vendorName);
    }

    return { success: true, invoiceId };

  } catch (error: any) {
    console.error('[BULK] Failed to save invoice:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Bulk Parse Execution
// ============================================================================

/**
 * Parse a single PDF and save to database
 */
export async function parseAndSave(
  pdfPath: string
): Promise<{ success: boolean; result?: ParseResult; error?: string }> {
  try {
    console.log(`[BULK] Parsing: ${path.basename(pdfPath)}`);
    
    // Parse with GPT
    const result = await parseInvoiceWithGPT(pdfPath);
    
    if (result.success && result.data) {
      // Save to database
      const saveResult = saveParsedInvoice(pdfPath, result);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      
      console.log(`[BULK] Saved: ${result.data.invoice_number || 'unknown'} (${result.vendorDetected || 'unknown vendor'})`);
      return { success: true, result };
    } else {
      // Still save the invoice record, but mark as failed parsing
      const saveResult = saveParsedInvoice(pdfPath, result);
      console.warn(`[BULK] Parse failed for ${path.basename(pdfPath)}: ${result.error}`);
      return { success: false, result, error: result.error };
    }

  } catch (error: any) {
    console.error(`[BULK] Error processing ${pdfPath}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Run bulk parsing on all PDFs in a directory
 */
export async function runBulkParse(
  directory: string,
  options: BulkParseOptions = {}
): Promise<BulkParseProgress> {
  const {
    delayMs = 2500,
    resume = false,
    limit,
    highQuality = false,
    maxRetries = 3,
    noHistory = false,
    onProgress,
    onParsed,
  } = options;

  // Configure parsing settings based on options
  if (highQuality) {
    PARSING_CONFIG.imageDetailLevel = 'auto';
    console.log('[BULK] High-quality mode enabled (image detail: auto)');
  } else {
    PARSING_CONFIG.imageDetailLevel = 'low';
  }
  
  if (maxRetries) {
    PARSING_CONFIG.maxRetries = maxRetries;
    console.log(`[BULK] Max retries set to ${maxRetries}`);
  }

  // Scan for PDFs
  let pdfFiles = scanForPDFs(directory);
  
  // Apply limit if specified
  if (limit && limit > 0) {
    pdfFiles = pdfFiles.slice(0, limit);
  }

  // Get already parsed files if resuming
  const alreadyParsed = resume ? getAlreadyParsedFiles() : new Set<string>();

  // Initialize progress
  const progress: BulkParseProgress = {
    total: pdfFiles.length,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    currentFile: null,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    errors: [],
    isRunning: true,
  };

  saveProgress(progress);

  // Process each PDF
  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfPath = pdfFiles[i];
    const fileName = path.basename(pdfPath);

    // Check if already parsed (when resuming)
    if (resume && (alreadyParsed.has(pdfPath) || alreadyParsed.has(fileName))) {
      progress.skipped++;
      progress.processed++;
      console.log(`[BULK] Skipping (already parsed): ${fileName}`);
      continue;
    }

    progress.currentFile = fileName;
    progress.lastUpdated = new Date().toISOString();
    
    if (onProgress) {
      onProgress(progress);
    }

    // Parse and save
    const result = await parseAndSave(pdfPath);
    
    if (result.success) {
      progress.successful++;
    } else {
      progress.failed++;
      progress.errors.push({ file: fileName, error: result.error || 'Unknown error' });
    }

    progress.processed++;
    progress.lastUpdated = new Date().toISOString();
    saveProgress(progress);

    if (onParsed && result.result) {
      onParsed(fileName, result.result);
    }

    // Log progress
    const pct = ((progress.processed / progress.total) * 100).toFixed(1);
    console.log(`[BULK] Progress: ${progress.processed}/${progress.total} (${pct}%) - Success: ${progress.successful}, Failed: ${progress.failed}, Skipped: ${progress.skipped}`);

    // Delay before next parse (except for last one)
    if (i < pdfFiles.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  progress.currentFile = null;
  progress.isRunning = false;
  progress.lastUpdated = new Date().toISOString();
  saveProgress(progress);

  console.log(`[BULK] Complete! Processed: ${progress.processed}, Success: ${progress.successful}, Failed: ${progress.failed}, Skipped: ${progress.skipped}`);

  return progress;
}

/**
 * Estimate time for bulk parse
 */
export function estimateBulkParseTime(pdfCount: number, delayMs: number = 2500): {
  minutes: number;
  formatted: string;
} {
  // Estimate ~3-5 seconds per invoice (delay + processing)
  const avgSecondsPerInvoice = (delayMs / 1000) + 2; // delay + ~2 sec for API call
  const totalSeconds = pdfCount * avgSecondsPerInvoice;
  const minutes = Math.ceil(totalSeconds / 60);
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  const formatted = hours > 0 
    ? `${hours}h ${mins}m`
    : `${mins} minutes`;

  return { minutes, formatted };
}
