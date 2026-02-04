#!/usr/bin/env npx ts-node
/**
 * Email Analysis Script
 * 
 * Scans ALL emails in the inbox and identifies "false invoices" -
 * documents that were incorrectly classified as invoices but are actually
 * credit memos, statements, or other document types.
 * 
 * Usage:
 *   npx tsx scripts/analyze-all-emails.ts [options]
 * 
 * Options:
 *   --output=FILE    Output file for false invoices (default: false_invoices.json)
 *   --limit=N        Only process N emails (for testing)
 *   --dry-run        Show what would be done without calling GPT
 *   --help           Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Imap from 'imap';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';

// Load environment variables
import 'dotenv/config';

import { getDatabase } from '../lib/db/client';
import { classifyDocument } from '../lib/gpt/documentClassifier';

// ============================================================================
// Configuration
// ============================================================================

const EMAIL_USER = 'invoices@pcsmilesai.com';
const EMAIL_PASS = 'Inv!PCSAI';
const IMAP_SERVER = 'imap.secureserver.net';

const DATA_DIR = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
const SAVE_DIR = path.join(DATA_DIR, 'email_invoices');

// ============================================================================
// Types
// ============================================================================

interface FalseInvoice {
  invoiceId: string;
  invoiceNumber: string;
  sourceMessageId: string;
  pdfPath: string;
  vendorName: string | null;
  amount: number | null;
  classification: {
    document_type: string;
    confidence: number;
    reasoning: string;
  };
  emailSubject: string;
  emailFrom: string;
}

interface AnalysisProgress {
  total: number;
  processed: number;
  falseInvoices: number;
  skipped: number;
  errors: number;
  startedAt: string;
  lastUpdated: string;
  isRunning: boolean;
}

interface CLIOptions {
  output: string;
  limit: number | undefined;
  dryRun: boolean;
  help: boolean;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    output: 'false_invoices.json',
    limit: undefined,
    dryRun: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    }
    else if (arg.startsWith('--limit=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) options.limit = val;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Email Analysis Script - Identify false invoices in the system

Usage:
  npx tsx scripts/analyze-all-emails.ts [options]

Options:
  --output=FILE    Output file for false invoices (default: false_invoices.json)
  --limit=N        Only process N emails (for testing)
  --dry-run        Show what would be done without calling GPT
  --help, -h       Show this help message

Examples:
  # Analyze all emails
  npx tsx scripts/analyze-all-emails.ts

  # Test with 10 emails
  npx tsx scripts/analyze-all-emails.ts --limit=10

  # Dry run to see what would be analyzed
  npx tsx scripts/analyze-all-emails.ts --dry-run
`);
}

// ============================================================================
// IMAP Connection
// ============================================================================

function createImapConnection(): Imap {
  return new Imap({
    user: EMAIL_USER,
    password: EMAIL_PASS,
    host: IMAP_SERVER,
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });
}

// ============================================================================
// Database Helpers
// ============================================================================

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  source_message_id: string | null;
  pdf_path: string | null;
  vendor_name: string | null;
  amount_cents: number | null;
}

function getInvoiceByMessageId(messageId: string): InvoiceRecord | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT id, invoice_number, source_message_id, pdf_path, vendor_name, amount_cents
    FROM invoices
    WHERE source_message_id = ? AND deleted = 0
  `).get(messageId) as InvoiceRecord | undefined;
  return result || null;
}

function getAllInvoicesWithMessageId(): Map<string, InvoiceRecord> {
  const db = getDatabase();
  const results = db.prepare(`
    SELECT id, invoice_number, source_message_id, pdf_path, vendor_name, amount_cents
    FROM invoices
    WHERE source_message_id IS NOT NULL AND source_message_id != '' AND deleted = 0
  `).all() as InvoiceRecord[];
  
  const map = new Map<string, InvoiceRecord>();
  for (const record of results) {
    if (record.source_message_id) {
      map.set(record.source_message_id, record);
    }
  }
  return map;
}

// ============================================================================
// Email Processing
// ============================================================================

async function fetchAllEmails(imap: Imap, limit?: number): Promise<ParsedMail[]> {
  return new Promise((resolve, reject) => {
    const emails: ParsedMail[] = [];
    
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`[EMAIL] Inbox has ${box.messages.total} total messages`);
        
        // Search for all emails
        imap.search(['ALL'], (searchErr, results) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }
          
          if (results.length === 0) {
            console.log('[EMAIL] No emails found');
            imap.end();
            resolve([]);
            return;
          }
          
          // Apply limit if specified
          let uidsToFetch = results;
          if (limit && limit < results.length) {
            uidsToFetch = results.slice(-limit); // Get most recent N emails
          }
          
          console.log(`[EMAIL] Fetching ${uidsToFetch.length} emails...`);
          
          const fetch = imap.fetch(uidsToFetch, {
            bodies: '',
            struct: true
          });
          
          let fetchedCount = 0;
          
          fetch.on('message', (msg, seqno) => {
            let buffer = '';
            
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });
            
            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                emails.push(parsed);
                fetchedCount++;
                if (fetchedCount % 100 === 0) {
                  console.log(`[EMAIL] Fetched ${fetchedCount}/${uidsToFetch.length} emails...`);
                }
              } catch (parseErr) {
                console.error(`[EMAIL] Failed to parse email ${seqno}:`, parseErr);
              }
            });
          });
          
          fetch.once('error', (fetchErr) => {
            reject(fetchErr);
          });
          
          fetch.once('end', () => {
            console.log(`[EMAIL] Finished fetching ${emails.length} emails`);
            imap.end();
            resolve(emails);
          });
        });
      });
    });
    
    imap.once('error', (err: Error) => {
      reject(err);
    });
    
    imap.connect();
  });
}

function hasPdfAttachment(email: ParsedMail): boolean {
  if (!email.attachments || email.attachments.length === 0) {
    return false;
  }
  return email.attachments.some(
    (att: Attachment) => att.filename?.toLowerCase().endsWith('.pdf')
  );
}

function getPdfAttachment(email: ParsedMail): Attachment | null {
  if (!email.attachments) return null;
  return email.attachments.find(
    (att: Attachment) => att.filename?.toLowerCase().endsWith('.pdf')
  ) || null;
}

function savePdfTemporarily(attachment: Attachment, messageId: string): string {
  const hash = crypto.createHash('md5').update(messageId).digest('hex').slice(0, 8);
  const filename = `temp_${attachment.filename?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document'}_${hash}.pdf`;
  const tempPath = path.join(SAVE_DIR, filename);
  
  fs.writeFileSync(tempPath, attachment.content);
  return tempPath;
}

function cleanupTempFile(filePath: string): void {
  try {
    if (filePath.includes('temp_') && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Main Analysis
// ============================================================================

async function analyzeEmails(options: CLIOptions): Promise<FalseInvoice[]> {
  console.log('========================================');
  console.log('Email Analysis - Identifying False Invoices');
  console.log('========================================');
  console.log('');
  
  // Load existing invoices with message IDs
  console.log('[DB] Loading invoices from database...');
  const invoicesByMessageId = getAllInvoicesWithMessageId();
  console.log(`[DB] Found ${invoicesByMessageId.size} invoices with source_message_id`);
  
  // Connect to IMAP
  console.log('[IMAP] Connecting to email server...');
  const imap = createImapConnection();
  
  let emails: ParsedMail[];
  try {
    emails = await fetchAllEmails(imap, options.limit);
  } catch (err) {
    console.error('[IMAP] Failed to fetch emails:', err);
    throw err;
  }
  
  console.log('');
  console.log(`[ANALYSIS] Processing ${emails.length} emails...`);
  console.log('');
  
  const falseInvoices: FalseInvoice[] = [];
  const progress: AnalysisProgress = {
    total: emails.length,
    processed: 0,
    falseInvoices: 0,
    skipped: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    isRunning: true,
  };
  
  for (const email of emails) {
    progress.processed++;
    progress.lastUpdated = new Date().toISOString();
    
    const messageId = email.messageId || '';
    const subject = email.subject || '(no subject)';
    const from = email.from?.text || '(unknown)';
    
    // Skip emails without PDF attachments
    if (!hasPdfAttachment(email)) {
      progress.skipped++;
      continue;
    }
    
    // Check if this email corresponds to an existing invoice
    const existingInvoice = messageId ? invoicesByMessageId.get(messageId) : null;
    
    if (!existingInvoice) {
      // Email not in database - will be handled in reparse phase
      progress.skipped++;
      continue;
    }
    
    // This email IS in the database - need to verify it's actually an invoice
    console.log(`[${progress.processed}/${progress.total}] Checking: ${subject.slice(0, 50)}...`);
    
    if (options.dryRun) {
      console.log(`  [DRY-RUN] Would classify invoice ${existingInvoice.invoice_number}`);
      continue;
    }
    
    // Get or save the PDF for classification
    let pdfPath = existingInvoice.pdf_path;
    let tempPath: string | null = null;
    
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      // Need to extract from email
      const attachment = getPdfAttachment(email);
      if (!attachment) {
        console.log(`  [SKIP] No PDF attachment found`);
        progress.skipped++;
        continue;
      }
      tempPath = savePdfTemporarily(attachment, messageId);
      pdfPath = tempPath;
    }
    
    try {
      // Classify the document
      const result = await classifyDocument(pdfPath, {
        subject,
        from,
        body: email.text?.slice(0, 500)
      });
      
      if (!result.success || !result.result) {
        console.log(`  [ERROR] Classification failed: ${result.error}`);
        progress.errors++;
        continue;
      }
      
      const classification = result.result;
      
      if (classification.document_type !== 'invoice') {
        // This is a FALSE INVOICE!
        console.log(`  [FALSE] ${classification.document_type} (${(classification.confidence * 100).toFixed(0)}%): ${classification.reasoning}`);
        
        falseInvoices.push({
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          sourceMessageId: messageId,
          pdfPath: existingInvoice.pdf_path || pdfPath,
          vendorName: existingInvoice.vendor_name,
          amount: existingInvoice.amount_cents ? existingInvoice.amount_cents / 100 : null,
          classification: {
            document_type: classification.document_type,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          },
          emailSubject: subject,
          emailFrom: from,
        });
        
        progress.falseInvoices++;
      } else {
        console.log(`  [OK] Invoice confirmed (${(classification.confidence * 100).toFixed(0)}%)`);
      }
      
      // Rate limit - 2 seconds between API calls
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (err: any) {
      console.error(`  [ERROR] ${err.message}`);
      progress.errors++;
    } finally {
      if (tempPath) {
        cleanupTempFile(tempPath);
      }
    }
  }
  
  progress.isRunning = false;
  progress.lastUpdated = new Date().toISOString();
  
  console.log('');
  console.log('========================================');
  console.log('Analysis Complete');
  console.log('========================================');
  console.log(`Total emails:     ${progress.total}`);
  console.log(`Processed:        ${progress.processed}`);
  console.log(`False invoices:   ${progress.falseInvoices}`);
  console.log(`Skipped:          ${progress.skipped}`);
  console.log(`Errors:           ${progress.errors}`);
  console.log('');
  
  return falseInvoices;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('');
  console.log('Configuration:');
  console.log(`  Output file: ${options.output}`);
  console.log(`  Limit: ${options.limit || 'none'}`);
  console.log(`  Dry run: ${options.dryRun}`);
  console.log('');
  
  try {
    const falseInvoices = await analyzeEmails(options);
    
    // Save results
    const outputPath = path.join(process.cwd(), options.output);
    const output = {
      generatedAt: new Date().toISOString(),
      totalFalseInvoices: falseInvoices.length,
      falseInvoices,
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Results saved to: ${outputPath}`);
    
    if (falseInvoices.length > 0) {
      console.log('');
      console.log('False invoices found:');
      for (const inv of falseInvoices) {
        console.log(`  - ${inv.invoiceNumber}: ${inv.classification.document_type} (${inv.emailSubject.slice(0, 40)}...)`);
      }
      console.log('');
      console.log(`Run: npx tsx scripts/migrate-false-invoices.ts --input=${options.output}`);
    }
    
  } catch (err) {
    console.error('Analysis failed:', err);
    process.exit(1);
  }
}

main();
