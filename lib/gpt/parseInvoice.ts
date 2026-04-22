import OpenAI from 'openai';
import { execSync } from 'child_process';
import { convertPdfToBase64Images, formatImagesForOpenAI } from './pdfToImages';
import { getKnowledgeBase, getOrCreateKnowledgeBase, getTrainingPrompt, getMasterParsingPrompt, upsertKnowledgeBase } from './knowledgeBase';
import { getRecentHistory, formatHistoryForPrompt, addToHistory, MAX_HISTORY_EXAMPLES, type HistoricalInvoice } from './vendorHistory';
import { QBOClient } from '../qbo/qboClient';
import { PCS_CLASSES, getDentalOffices } from '../qbo/pcsClasses';

// Lazy initialization of OpenAI client to avoid build-time errors
let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// Model configuration - GPT-5 Nano is fast and cost-effective for invoice parsing
// Set GPT_MODEL=gpt-5-nano for faster/cheaper parsing, or gpt-4o for better accuracy
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-5-nano';

// Use a more capable model for page classification tasks (multi-image reasoning)
// gpt-5-nano returns empty responses for multi-image classification
const CLASSIFICATION_MODEL = process.env.GPT_CLASSIFICATION_MODEL || 'gpt-4o';

// Parsing configuration - can be overridden for bulk operations
export const PARSING_CONFIG = {
  maxCompletionTokens: 4000, // Increased from 2000 for complex invoices
  maxRetries: 3,
  retryDelayMs: 2000,
  imageDetailLevel: 'low' as 'high' | 'low' | 'auto', // Can be set to 'auto' for high-quality mode
};

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = PARSING_CONFIG.maxRetries,
  baseDelayMs: number = PARSING_CONFIG.retryDelayMs
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRateLimitError = error.status === 429 || error.code === 'rate_limit_exceeded';
      const isServerError = error.status >= 500 && error.status < 600;
      const isTimeout = error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET';
      
      if (!isRateLimitError && !isServerError && !isTimeout) {
        // Non-retryable error, throw immediately
        throw error;
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[PCS-AI] Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms - Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after all retries');
}

// ============================================================================
// QBO Data Fetching for Master Parsing Prompt
// ============================================================================

// Cache for QBO vendors (refreshed every 5 minutes)
let _vendorsCache: { data: string[]; timestamp: number } | null = null;
const VENDORS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get list of QBO vendor names for PCS AI context
 */
async function getQBOVendorNames(): Promise<string[]> {
  // Check cache first
  if (_vendorsCache && Date.now() - _vendorsCache.timestamp < VENDORS_CACHE_TTL) {
    return _vendorsCache.data;
  }

  try {
    const qboClient = new QBOClient();
    await qboClient.initialize();
    const vendors = await qboClient.getAllVendors();
    const vendorNames = vendors.map(v => v.displayName).sort();
    
    // Update cache
    _vendorsCache = {
      data: vendorNames,
      timestamp: Date.now()
    };
    
    console.log(`[PCS-AI] Loaded ${vendorNames.length} QBO vendors for parsing context`);
    return vendorNames;
  } catch (error: any) {
    console.warn('[PCS-AI] Failed to fetch QBO vendors:', error.message);
    // Return cached data if available, otherwise empty array
    return _vendorsCache?.data || [];
  }
}

/**
 * Get list of PCS location names (from QBO classes) for PCS AI context
 */
function getPCSLocationNames(): string[] {
  const offices = getDentalOffices();
  // Extract city names from "General-CityName" format
  return offices.map(c => c.name.replace('General-', '')).sort();
}

/**
 * Format QBO vendors list for inclusion in the master prompt
 */
async function formatQBOVendorsForPrompt(): Promise<string> {
  const vendors = await getQBOVendorNames();
  if (vendors.length === 0) {
    return 'QBO vendors list not available - use vendor name from invoice';
  }
  return vendors.join('\n');
}

/**
 * Format QBO classes/locations for inclusion in the master prompt
 */
function formatQBOClassesForPrompt(): string {
  const offices = getDentalOffices();
  const lines = offices.map(c => {
    const cityName = c.name.replace('General-', '');
    return `${c.name} → "${cityName}"`;
  });
  return lines.join('\n');
}

/**
 * Build the complete master parsing prompt with QBO data injected
 */
async function buildMasterParsingPrompt(): Promise<string | null> {
  const masterPrompt = getMasterParsingPrompt();
  if (!masterPrompt) {
    console.log('[PCS-AI] No master parsing prompt found in database');
    return null;
  }

  // Get QBO data
  const vendorsList = await formatQBOVendorsForPrompt();
  const classesList = formatQBOClassesForPrompt();

  // Replace placeholders with actual QBO data
  let prompt = masterPrompt.prompt_text;
  prompt = prompt.replace('{{QBO_VENDORS}}', vendorsList);
  prompt = prompt.replace('{{QBO_CLASSES}}', classesList);

  return prompt;
}

export interface ParsedInvoice {
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  vendor_name: string | null;
  total: number | null;
  office_location: string | null;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
  }>;
  parsing_confidence: number;
  raw_response?: string;
  sourcePages?: number[];
}

export interface MultiInvoiceParseResult {
  invoices: ParsedInvoice[];
  document_invoice_total: number;
}

export interface ParseResult {
  success: boolean;
  data: ParsedInvoice | null;
  multipleInvoices?: MultiInvoiceParseResult; // Set when document contains multiple invoices
  error?: string;
  vendorDetected?: string;
  knowledgeBaseUsed?: boolean;
}

// ============================================================================
// Vendor Detection
// ============================================================================

const VENDOR_DETECTION_PROMPT = `You are analyzing an invoice image to identify the vendor/company that issued it.

Look for:
- Company name/logo at the top of the invoice
- "From" or "Bill From" sections
- Company letterhead
- Remit-to address company name

Return ONLY the vendor name as a single line of text. Do not include any explanation.
If you cannot determine the vendor, respond with "Unknown".`;

// Text-based page classification prompt - determines which pages start new invoices
// Uses extracted text instead of images to avoid vision token limits
const PAGE_CLASSIFICATION_PROMPT = `You are analyzing the extracted text from each page of a PDF document that may contain one or more invoices, plus pages that are NOT invoices.

For each page, determine:
1. Is this page part of an invoice, or is it a non-invoice page?
2. If it IS an invoice page, is it the FIRST page of a NEW invoice or a continuation?

Signs a page starts a NEW invoice:
- Has a company header/name near the top (e.g., "TC Dental Laboratory", vendor name)
- Has "INVOICE" or "DELIVERY SLIP" as a title
- Has a distinct invoice number (e.g., "Invoice Number: 260-447")
- Has invoice date, "Bill To", "Ship To" sections
- Each distinct invoice number = a distinct invoice

Signs a page is a CONTINUATION:
- Continues line items from previous page
- Shows "Page 2 of 2" pagination
- No new invoice header or number

Signs a page is NOT an invoice:
- Email forwarding/printout content
- QBO/accounting software interface or screenshots
- System confirmation or status messages
- Cover letters or transmittal pages
- Blank or nearly blank pages

Return ONLY a JSON object:
{"page_starts": [1, 2, 4], "non_invoice_pages": [7, 8, 9], "invoice_count": 3, "reasoning": "brief explanation"}

page_starts = pages that START a new invoice (1-indexed)
non_invoice_pages = pages that are NOT part of any invoice (1-indexed)`;

// Vision-based page classification prompt - used when text extraction is insufficient (scanned/image PDFs)
const VISION_PAGE_CLASSIFICATION_PROMPT = `You are analyzing images of each page from a multi-page PDF document. The document may contain one or more invoices, plus pages that are NOT invoices.

For each page image (labeled PAGE 1, PAGE 2, etc.), determine:
1. Is this page an actual invoice page? Or is it something else (email printout, system screenshot, QBO page, cover letter, blank page)?
2. If it IS an invoice page, is it the FIRST page of a NEW invoice or a CONTINUATION of the previous invoice?

Signs a page starts a NEW INVOICE:
- Has a company header/logo (e.g., "TC Dental Laboratory", vendor name, company address)
- Has "INVOICE" or "DELIVERY SLIP" title
- Has a distinct invoice number
- Has invoice date, Bill To, Ship To sections

Signs a page is a CONTINUATION of the previous invoice:
- Continues line items from the previous page
- Shows pagination like "Page 2 of 2"
- No new invoice header

Signs a page is NOT an invoice:
- Email client interface or forwarded email
- Accounting software (QBO) screenshot
- System-generated confirmation/status page
- Cover letter or transmittal page
- Blank or nearly blank page

Return ONLY a JSON object:
{"page_starts": [1, 2, 4], "non_invoice_pages": [7, 8, 9], "invoice_count": 3, "reasoning": "brief explanation"}

page_starts = pages that START a new invoice (1-indexed)
non_invoice_pages = pages that are NOT part of any invoice (1-indexed)`;

/**
 * Detect the vendor from invoice images (uses only first page to stay within token limits)
 */
export async function detectVendor(base64Images: string[]): Promise<string> {
  try {
    // Only use first page for vendor detection - vendor info is always on page 1
    const imagesToUse = base64Images.slice(0, 1);
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VENDOR_DETECTION_PROMPT },
            ...formatImagesForOpenAI(imagesToUse)
          ]
        }
      ]
    });

    const vendorName = response.choices[0]?.message?.content?.trim() || 'Unknown';
    return vendorName;
  } catch (error: any) {
    console.error('[PCS-AI] Vendor detection error:', error.message);
    return 'Unknown';
  }
}

// ============================================================================
// Multi-Invoice Detection: Page-by-Page Classification
// ============================================================================

/**
 * Helper to extract JSON from a GPT response (handles markdown code blocks, raw JSON, etc.)
 */
function extractJsonFromResponse(rawResponse: string): any | null {
  if (!rawResponse || rawResponse.trim().length === 0) return null;
  
  let jsonStr = rawResponse.trim();
  
  // Method 1: Extract from markdown code block
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  
  // Method 2: Find JSON object directly
  if (!codeBlockMatch) {
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Extract text from a PDF per page using pdftotext.
 * Returns an array of strings, one per page.
 */
function extractTextPerPage(pdfPath: string): string[] {
  try {
    const text = execSync(`pdftotext -layout "${pdfPath}" -`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // pdftotext separates pages with form feed character (\f)
    // IMPORTANT: Keep ALL pages (including empty ones) to preserve correct page indices
    const pages = text.split('\f');
    // Remove trailing empty entry (pdftotext often adds a trailing form feed)
    while (pages.length > 0 && pages[pages.length - 1].trim() === '') {
      pages.pop();
    }
    return pages;
  } catch (error: any) {
    console.warn('[PCS-AI] pdftotext extraction failed:', error.message);
    return [];
  }
}

/**
 * Build page clusters from classification results, excluding non-invoice pages.
 * @param pageStarts 0-indexed pages that start a new invoice
 * @param nonInvoicePages Set of 0-indexed pages that are NOT invoices
 * @param totalPages Total number of pages in document
 */
function buildPageClusters(
  pageStarts: number[],
  nonInvoicePages: Set<number>,
  totalPages: number
): number[][] {
  const validStarts = pageStarts
    .filter(p => !nonInvoicePages.has(p))
    .sort((a, b) => a - b);
  
  if (validStarts.length === 0) {
    const invoicePages: number[] = [];
    for (let p = 0; p < totalPages; p++) {
      if (!nonInvoicePages.has(p)) invoicePages.push(p);
    }
    return invoicePages.length > 0 ? [invoicePages] : [[0]];
  }
  
  // Ensure the first non-excluded page is a start
  const firstInvoicePage = validStarts[0];
  for (let p = 0; p < firstInvoicePage; p++) {
    if (!nonInvoicePages.has(p) && !validStarts.includes(p)) {
      validStarts.unshift(p);
      validStarts.sort((a, b) => a - b);
      break;
    }
  }
  
  const clusters: number[][] = [];
  for (let i = 0; i < validStarts.length; i++) {
    const start = validStarts[i];
    const end = i + 1 < validStarts.length ? validStarts[i + 1] : totalPages;
    const cluster: number[] = [];
    for (let p = start; p < end; p++) {
      if (!nonInvoicePages.has(p)) {
        cluster.push(p);
      }
    }
    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }
  
  return clusters.length > 0 ? clusters : [[0]];
}

/**
 * Parse a GPT classification response into page_starts and non_invoice_pages (0-indexed).
 */
function parseClassificationResponse(parsed: any, totalPages: number): { pageStarts: number[]; nonInvoicePages: Set<number> } | null {
  if (!parsed) return null;
  
  const nonInvoicePages = new Set<number>();
  if (Array.isArray(parsed.non_invoice_pages)) {
    for (const p of parsed.non_invoice_pages) {
      const idx = (p as number) - 1;
      if (idx >= 0 && idx < totalPages) nonInvoicePages.add(idx);
    }
  }
  
  if (Array.isArray(parsed.page_starts) && parsed.page_starts.length > 0) {
    const pageStarts = (parsed.page_starts as number[])
      .map(p => p - 1)
      .filter(p => p >= 0 && p < totalPages);
    return { pageStarts, nonInvoicePages };
  }
  
  if (typeof parsed.invoice_count === 'number' && parsed.invoice_count > 0) {
    // Got invoice_count but no explicit page_starts — infer from non-excluded pages
    const invoicePages: number[] = [];
    for (let p = 0; p < totalPages; p++) {
      if (!nonInvoicePages.has(p)) invoicePages.push(p);
    }
    const count = Math.min(parsed.invoice_count, invoicePages.length);
    // Assume each invoice is roughly equal pages
    const pageStarts = count > 0 ? invoicePages.slice(0, count) : [0];
    return { pageStarts, nonInvoicePages };
  }
  
  return null;
}

/**
 * Vision-based page classification: sends page images to GPT for visual analysis.
 * Used when text extraction is insufficient (scanned/image-only PDFs).
 */
async function classifyDocumentPagesByVision(base64Images: string[], totalPages: number, pdfPath?: string): Promise<number[][]> {
  console.log(`[PCS-AI] Vision-based classification for ${totalPages} pages...`);
  
  // Strategy: classify pages in batches of up to 4 images per call for reliability
  // Each batch asks: for these pages, which are invoices vs non-invoices?
  const BATCH_SIZE = 4;
  const pageClassifications: Array<{ page: number; isInvoice: boolean; isNewInvoice: boolean; invoiceNumber?: string }> = [];
  
  const perPagePrompt = `Classify each page image below. For EACH page, determine:
- Is this page an actual invoice/delivery slip from a vendor? (NOT an email, NOT a QBO screenshot, NOT a system page)
- If it IS an invoice page, does it START a new invoice or continue the previous one?

Return ONLY a JSON object:
{"pages": [{"page": 1, "is_invoice": true, "is_new_invoice": true, "invoice_number": "123-456"}, {"page": 2, "is_invoice": false, "reason": "email printout"}]}

is_invoice: true if this is an actual vendor invoice page, false if it's an email, screenshot, cover letter, or blank
is_new_invoice: true if this page starts a NEW invoice (has its own header/invoice number), false if it continues the previous invoice
invoice_number: the invoice number if visible (null if not)`;

  try {
    for (let batchStart = 0; batchStart < totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalPages);
      const batchPages: number[] = [];
      
      const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];
      
      messageContent.push({ type: 'text', text: perPagePrompt });
      
      for (let i = batchStart; i < batchEnd; i++) {
        batchPages.push(i + 1);
        messageContent.push({ type: 'text', text: `--- PAGE ${i + 1} ---` });
        messageContent.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${base64Images[i]}`, detail: 'low' }
        });
      }
      
      console.log(`[PCS-AI] Vision batch: classifying pages ${batchPages.join(', ')} (model: ${CLASSIFICATION_MODEL})...`);
      
      const response = await getOpenAIClient().chat.completions.create({
        model: CLASSIFICATION_MODEL,
        max_completion_tokens: 800,
        messages: [
          {
            role: 'system',
            content: 'You classify document pages. Respond with ONLY valid JSON. No explanation text.'
          },
          { role: 'user', content: messageContent }
        ]
      });
      
      const rawResponse = response.choices[0]?.message?.content?.trim() || '';
      const finishReason = response.choices[0]?.finish_reason || 'unknown';
      console.log(`[PCS-AI] Vision batch response (${rawResponse.length} chars, finish: ${finishReason}):`, rawResponse.substring(0, 300));
      
      if (rawResponse.length === 0) {
        console.warn(`[PCS-AI] Empty response for pages ${batchPages.join(',')}, marking as unknown`);
        for (const p of batchPages) {
          pageClassifications.push({ page: p, isInvoice: true, isNewInvoice: true });
        }
        continue;
      }
      
      const parsed = extractJsonFromResponse(rawResponse);
      if (parsed && Array.isArray(parsed.pages)) {
        for (const pg of parsed.pages) {
          pageClassifications.push({
            page: pg.page,
            isInvoice: pg.is_invoice === true,
            isNewInvoice: pg.is_new_invoice === true,
            invoiceNumber: pg.invoice_number || undefined
          });
        }
      } else {
        console.warn(`[PCS-AI] Could not parse batch response, marking pages ${batchPages.join(',')} as invoice starts`);
        for (const p of batchPages) {
          pageClassifications.push({ page: p, isInvoice: true, isNewInvoice: true });
        }
      }
    }
    
    // Build page_starts and non_invoice_pages from classifications
    const pageStarts: number[] = [];
    const nonInvoicePages = new Set<number>();
    
    for (const pc of pageClassifications) {
      const idx = pc.page - 1; // Convert to 0-indexed
      if (idx < 0 || idx >= totalPages) continue;
      
      if (!pc.isInvoice) {
        nonInvoicePages.add(idx);
      } else if (pc.isNewInvoice) {
        pageStarts.push(idx);
      }
    }
    
    console.log(`[PCS-AI] Vision classification summary:`, {
      totalPages,
      invoiceStarts: pageStarts.map(p => p + 1),
      nonInvoicePages: Array.from(nonInvoicePages).map(p => p + 1),
      allClassifications: pageClassifications.map(pc => ({ page: pc.page, invoice: pc.isInvoice, new: pc.isNewInvoice }))
    });
    
    if (pageStarts.length > 0) {
      const clusters = buildPageClusters(pageStarts, nonInvoicePages, totalPages);
      console.log(`[PCS-AI] Vision classification complete:`, {
        invoicesFound: clusters.length,
        clusters: clusters.map(c => c.map(p => p + 1))
      });
      return clusters;
    }
    
    console.warn('[PCS-AI] Vision found no invoice start pages');
  } catch (error: any) {
    console.error('[PCS-AI] Vision classification error:', error.message);
  }
  
  // Fallback: try text heuristic if we have the PDF path
  if (pdfPath) {
    const fallbackTexts = extractTextPerPage(pdfPath);
    if (fallbackTexts.length > 0) {
      console.log('[PCS-AI] Vision failed, falling back to text heuristic');
      return classifyPagesByTextHeuristic(fallbackTexts, totalPages);
    }
  }
  
  // Last resort: treat the entire document as one invoice
  console.warn('[PCS-AI] All classification methods failed, treating as single invoice');
  return [[...Array(totalPages).keys()]];
}

/**
 * Classify all pages in a document to determine invoice boundaries.
 * Uses text extraction first; falls back to vision-based classification when
 * text extraction is insufficient (scanned/image-only pages).
 * Returns page clusters: each cluster is an array of page indices belonging to one invoice.
 * Non-invoice pages (email printouts, QBO screenshots, etc.) are excluded.
 */
export async function classifyDocumentPages(
  pdfPath: string,
  totalPages: number,
  base64Images?: string[]
): Promise<number[][]> {
  if (totalPages <= 1) {
    return [[0]];
  }

  console.log(`[PCS-AI] Classifying ${totalPages} pages for invoice boundaries...`);

  // Extract text from each page (preserves page indices, including empty pages)
  const pageTexts = extractTextPerPage(pdfPath);
  
  // Count pages that have meaningful text content (> 30 chars)
  const pagesWithText = pageTexts.filter(t => t.trim().length > 30).length;
  const textCoverage = totalPages > 0 ? pagesWithText / totalPages : 0;
  
  console.log(`[PCS-AI] Text extraction: ${pagesWithText}/${totalPages} pages have text (${Math.round(textCoverage * 100)}% coverage)`);

  // If text extraction covers less than 50% of pages, use vision-based classification
  if (textCoverage < 0.5 && base64Images && base64Images.length > 0) {
    console.log('[PCS-AI] Insufficient text extraction, switching to vision-based classification');
    return classifyDocumentPagesByVision(base64Images, totalPages, pdfPath);
  }

  if (pageTexts.length === 0) {
    if (base64Images && base64Images.length > 0) {
      return classifyDocumentPagesByVision(base64Images, totalPages, pdfPath);
    }
    console.warn('[PCS-AI] No text extracted and no images available, defaulting to one invoice per page');
    return Array.from({ length: totalPages }, (_, i) => [i]);
  }

  // Build page summaries — use actual page indices to keep numbering correct
  const pageSummaries = pageTexts.map((text, i) => {
    const trimmed = text.trim().substring(0, 400);
    if (trimmed.length === 0) {
      return `=== PAGE ${i + 1} ===\n[NO TEXT CONTENT - this page may be an image/scan or blank]`;
    }
    return `=== PAGE ${i + 1} ===\n${trimmed}`;
  }).join('\n\n');

  console.log(`[PCS-AI] Sending ${pageTexts.length} pages for text-based classification (model: ${CLASSIFICATION_MODEL})...`);

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: CLASSIFICATION_MODEL,
      max_completion_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: PAGE_CLASSIFICATION_PROMPT + `\n\nThe document has ${totalPages} pages total. Here is the extracted text:\n\n${pageSummaries}`
        }
      ]
    });

    const rawResponse = response.choices[0]?.message?.content?.trim() || '';
    console.log(`[PCS-AI] Page classification response (${rawResponse.length} chars):`, rawResponse.substring(0, 300));

    const parsed = extractJsonFromResponse(rawResponse);
    const result = parseClassificationResponse(parsed, totalPages);
    
    if (result) {
      const clusters = buildPageClusters(result.pageStarts, result.nonInvoicePages, totalPages);
      
      console.log(`[PCS-AI] Page classification complete:`, {
        totalPages,
        invoicesFound: clusters.length,
        nonInvoicePages: Array.from(result.nonInvoicePages).map(p => p + 1),
        clusters: clusters.map(c => c.map(p => p + 1)),
        reasoning: parsed?.reasoning
      });
      
      return clusters;
    }

    console.warn('[PCS-AI] Could not parse page classification response');
    
    // Fall back to vision if text classification failed and images are available
    if (base64Images && base64Images.length > 0) {
      console.log('[PCS-AI] Falling back to vision-based classification...');
      return classifyDocumentPagesByVision(base64Images, totalPages, pdfPath);
    }
  } catch (error: any) {
    console.error('[PCS-AI] GPT page classification error:', error.message);
    
    if (base64Images && base64Images.length > 0) {
      console.log('[PCS-AI] Falling back to vision-based classification after error...');
      return classifyDocumentPagesByVision(base64Images, totalPages, pdfPath);
    }
  }

  // Last resort: text-based heuristic
  console.log('[PCS-AI] Using text heuristic for page classification...');
  return classifyPagesByTextHeuristic(pageTexts, totalPages);
}

/**
 * Fallback text heuristic for page classification when GPT call fails.
 * Looks for invoice-like headers on each page and detects non-invoice pages.
 */
function classifyPagesByTextHeuristic(pageTexts: string[], totalPages: number): number[][] {
  const invoicePatterns = [
    /\binvoice\b/i,
    /\bdelivery\s+slip\b/i,
    /\binvoice\s*(number|#|no\.?)\s*[:.]?\s*\d/i,
    /\bstatement\b/i,
  ];
  
  const nonInvoicePatterns = [
    /\bsent\s+via\s+email\b/i,
    /\bemail\s+alias\b/i,
    /\bauto\s*filled\b/i,
    /\bDetails\s+Have\s+Been\s+Registered\b/i,
    /\bforwarded\s+message\b/i,
    /\bfrom:\s*.*@/i,
  ];
  
  const pageStarts: number[] = [];
  const nonInvoicePages = new Set<number>();
  
  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i];
    const trimmed = pageText.trim();
    
    // Empty/near-empty pages are non-invoice
    if (trimmed.length < 20) {
      nonInvoicePages.add(i);
      continue;
    }
    
    const snippet = trimmed.substring(0, 400);
    
    // Check for non-invoice patterns
    const nonInvoiceScore = nonInvoicePatterns.filter(p => p.test(snippet)).length;
    if (nonInvoiceScore >= 2) {
      nonInvoicePages.add(i);
      continue;
    }
    
    // Check for invoice start patterns
    const invoiceScore = invoicePatterns.filter(p => p.test(snippet)).length;
    if (invoiceScore >= 2 || (i === 0 && invoiceScore >= 1)) {
      pageStarts.push(i);
    }
  }
  
  // Ensure at least one start if there are any non-excluded pages
  if (pageStarts.length === 0) {
    for (let p = 0; p < totalPages; p++) {
      if (!nonInvoicePages.has(p)) {
        pageStarts.push(p);
        break;
      }
    }
  }
  
  const clusters = buildPageClusters(pageStarts, nonInvoicePages, totalPages);
  
  console.log(`[PCS-AI] Text heuristic classification:`, {
    totalPages,
    invoicesFound: clusters.length,
    nonInvoicePages: Array.from(nonInvoicePages).map(p => p + 1),
    clusters: clusters.map(c => c.map(p => p + 1))
  });
  
  return clusters;
}

/**
 * Parse multiple invoices by processing each page cluster individually.
 * Each cluster is parsed using the full single-invoice pipeline (master prompt, vendor KB, history).
 */
async function parseMultipleInvoicesByClusters(
  base64Images: string[],
  pageClusters: number[][],
  vendorName: string | null
): Promise<ParsedInvoice[]> {
  console.log(`[PCS-AI] Parsing ${pageClusters.length} invoice clusters...`);
  const results: ParsedInvoice[] = [];
  
  // Parse clusters in parallel batches of 3 for speed
  const PARSE_BATCH_SIZE = 3;
  
  for (let batchStart = 0; batchStart < pageClusters.length; batchStart += PARSE_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PARSE_BATCH_SIZE, pageClusters.length);
    const batchPromises: Promise<{ index: number; invoice: ParsedInvoice }>[] = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const cluster = pageClusters[i];
      const clusterImages = cluster.map(pageIdx => base64Images[pageIdx]);
      const clusterIndex = i;
      
      console.log(`[PCS-AI] Queuing cluster ${i + 1}/${pageClusters.length} (pages: ${cluster.map(p => p + 1).join(',')})`);
      
      batchPromises.push(
        parseInvoiceFromImages(clusterImages, vendorName)
          .then(result => {
            if (result.success && result.data) {
              result.data.sourcePages = cluster;
              return { index: clusterIndex, invoice: result.data };
            }
            console.warn(`[PCS-AI] Cluster ${clusterIndex + 1} parse failed:`, result.error);
            return {
              index: clusterIndex,
              invoice: {
                invoice_number: null,
                invoice_date: null,
                due_date: null,
                vendor_name: vendorName,
                total: null,
                office_location: null,
                line_items: [],
                parsing_confidence: 0,
                raw_response: result.error || 'Parsing failed',
                sourcePages: cluster,
              }
            };
          })
      );
    }
    
    const batchResults = await Promise.all(batchPromises);
    // Sort by original index to maintain order
    batchResults.sort((a, b) => a.index - b.index);
    results.push(...batchResults.map(r => r.invoice));
  }
  
  console.log(`[PCS-AI] Successfully parsed ${results.length} invoices from ${pageClusters.length} clusters`);
  return results;
}

// ============================================================================
// Invoice Parsing
// ============================================================================

const BASE_PARSING_PROMPT = `You are an expert invoice parser for dental practice management.

EXTRACTION SCHEMA - Return a JSON object with these exact fields:
{
  "invoice_number": "string or null",
  "invoice_date": "MM/DD/YYYY or null",
  "due_date": "MM/DD/YYYY or null",
  "vendor_name": "string or null",
  "total": number or null (as decimal, e.g., 1234.56),
  "office_location": "string or null",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null
    }
  ],
  "parsing_confidence": number between 0 and 1
}

IMPORTANT RULES:
- Return ONLY valid JSON, no explanation text
- Amounts should be numbers without currency symbols or commas
- Dates MUST be in MM/DD/YYYY format (e.g., 01/15/2025)
- parsing_confidence: 1.0 = very confident, 0.5 = uncertain, 0.0 = guessing
- For office_location, look for "Ship To", "Deliver To", or dental office names

`;

/**
 * Parse an invoice PDF using PCS AI vision
 * Automatically detects and handles documents containing multiple invoices
 */
export async function parseInvoiceWithGPT(
  pdfPath: string,
  vendorNameHint?: string | null,
  skipMultiInvoiceDetection?: boolean // Can be set to true for reparsing single invoices
): Promise<ParseResult> {
  try {
    // Convert PDF to images
    console.log('[PCS-AI] Converting PDF to images:', pdfPath);
    const base64Images = await convertPdfToBase64Images(pdfPath);
    console.log(`[PCS-AI] Converted ${base64Images.length} page(s)`);

    // Detect vendor if not provided
    let vendorName = vendorNameHint;
    if (!vendorName || vendorName === 'Unknown') {
      console.log('[PCS-AI] Detecting vendor...');
      vendorName = await detectVendor(base64Images);
      console.log('[PCS-AI] Detected vendor:', vendorName);
    }

    // Check for multiple invoices in document (unless explicitly skipped)
    // Uses text extraction first; falls back to vision-based classification for scanned PDFs
    if (!skipMultiInvoiceDetection && base64Images.length > 1) {
      const pageClusters = await classifyDocumentPages(pdfPath, base64Images.length, base64Images);
      
      if (pageClusters.length > 1) {
        console.log(`[PCS-AI] Document contains ${pageClusters.length} invoices across ${base64Images.length} pages - parsing each cluster`);
        
        // Parse each invoice cluster individually using the full single-invoice pipeline
        const parsedInvoices = await parseMultipleInvoicesByClusters(base64Images, pageClusters, vendorName);
        
        if (parsedInvoices.length > 0) {
          // Return multi-invoice result
          return {
            success: true,
            data: parsedInvoices[0], // First invoice as primary data for backward compatibility
            multipleInvoices: {
              invoices: parsedInvoices,
              document_invoice_total: parsedInvoices.length
            },
            vendorDetected: vendorName || undefined,
            knowledgeBaseUsed: true // Each cluster uses the full KB pipeline
          };
        }
        // If multi-invoice parsing failed, fall through to single invoice parsing
        console.log('[PCS-AI] Multi-invoice cluster parsing failed, falling back to single invoice mode');
      }
    }

    // Build the system prompt: Master Prompt + Vendor KB + Base Prompt
    let knowledgeBaseUsed = false;
    let masterPromptUsed = false;
    let systemPrompt = BASE_PARSING_PROMPT;
    let historicalExamples: HistoricalInvoice[] = [];

    // Load master parsing prompt with QBO data
    const masterPrompt = await buildMasterParsingPrompt();
    if (masterPrompt) {
      systemPrompt = masterPrompt + '\n\n' + systemPrompt;
      masterPromptUsed = true;
      console.log('[PCS-AI] Using master parsing prompt with QBO data');
    }

    if (vendorName && vendorName !== 'Unknown') {
      // Load vendor-specific knowledge base
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        // Insert vendor KB between master and base prompts
        systemPrompt = (masterPrompt ? masterPrompt + '\n\n' : '') + 
                       kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
        knowledgeBaseUsed = true;
        console.log(`[PCS-AI] Using knowledge base for ${vendorName} (v${kb.version})`);
      } else {
        console.log(`[PCS-AI] No knowledge base found for ${vendorName}, using default prompt`);
      }
      
      // Load historical examples for few-shot learning
      historicalExamples = getRecentHistory(vendorName, MAX_HISTORY_EXAMPLES);
      if (historicalExamples.length > 0) {
        const historyPrompt = formatHistoryForPrompt(historicalExamples);
        systemPrompt += historyPrompt;
        console.log(`[PCS-AI] Including ${historicalExamples.length} historical examples for ${vendorName}`);
      } else {
        console.log(`[PCS-AI] No historical examples available for ${vendorName}`);
      }
    }

    // Build message content with historical example images (first page only) + new invoice
    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];
    
    // Add instruction text
    messageContent.push({ 
      type: 'text', 
      text: historicalExamples.length > 0 
        ? `Below are ${historicalExamples.length} historical invoice examples from this vendor (for reference), followed by the NEW invoice to parse. Parse ONLY the NEW invoice and extract all fields. Return only JSON.`
        : 'Parse this invoice and extract all fields. Return only JSON.'
    });
    
    // Add historical example images (first page only, to save tokens)
    for (let i = 0; i < historicalExamples.length; i++) {
      const example = historicalExamples[i];
      if (example.images.length > 0) {
        messageContent.push({ 
          type: 'text', 
          text: `--- Historical Example ${i + 1} (Invoice: ${example.invoice_number || 'Unknown'}) ---` 
        });
        messageContent.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${example.images[0]}`, detail: 'low' }
        });
      }
    }
    
    // Add separator and new invoice
    if (historicalExamples.length > 0) {
      messageContent.push({ type: 'text', text: '--- NEW INVOICE TO PARSE (extract data from this one) ---' });
    }
    
    // Add new invoice images (uses configurable detail level)
    messageContent.push(...formatImagesForOpenAI(base64Images, PARSING_CONFIG.imageDetailLevel));

    // Call PCS AI with images (with retry logic for robustness)
    console.log('[PCS-AI] Calling PCS AI for parsing...');
    const response = await withRetry(async () => {
      return await getOpenAIClient().chat.completions.create({
        model: GPT_MODEL,
        max_completion_tokens: PARSING_CONFIG.maxCompletionTokens,
        // Note: PCS AI only supports default temperature (1), so we don't set it
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: messageContent
          }
        ]
      });
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    console.log('[PCS-AI] Raw response length:', rawResponse.length);

    // Parse the JSON response
    let parsedData: ParsedInvoice;
    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = rawResponse;
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      
      parsedData = JSON.parse(jsonStr.trim());
      
      // Ensure all required fields exist
      parsedData = {
        invoice_number: parsedData.invoice_number || null,
        invoice_date: parsedData.invoice_date || null,
        due_date: parsedData.due_date || null,
        vendor_name: parsedData.vendor_name || vendorName || null,
        total: typeof parsedData.total === 'number' ? parsedData.total : null,
        office_location: parsedData.office_location || null,
        line_items: Array.isArray(parsedData.line_items) ? parsedData.line_items : [],
        parsing_confidence: typeof parsedData.parsing_confidence === 'number' 
          ? parsedData.parsing_confidence 
          : 0.5,
        raw_response: rawResponse
      };

    } catch (parseError: any) {
      console.error('[PCS-AI] Failed to parse JSON response:', parseError.message);
      return {
        success: false,
        data: null,
        error: `Failed to parse PCS AI response as JSON: ${parseError.message}`,
        vendorDetected: vendorName || undefined,
        knowledgeBaseUsed
      };
    }

    console.log('[PCS-AI] Successfully parsed invoice:', {
      invoice_number: parsedData.invoice_number,
      vendor: parsedData.vendor_name,
      total: parsedData.total,
      confidence: parsedData.parsing_confidence
    });

    return {
      success: true,
      data: parsedData,
      vendorDetected: vendorName || undefined,
      knowledgeBaseUsed
    };

  } catch (error: any) {
    console.error('[PCS-AI] Invoice parsing error:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}

// ============================================================================
// Knowledge Base Training (from corrections)
// ============================================================================

export interface TrainingInput {
  vendorName: string;
  pdfPath: string;
  originalParsed: Record<string, any>;
  correctedData: Record<string, any>;
}

export interface TrainingResult {
  success: boolean;
  updatedPrompt?: string;
  error?: string;
  vendorName: string;
  version?: number;
}

/**
 * Update a vendor's knowledge base based on correction feedback
 * 
 * This function:
 * 1. Loads historical examples from the vendor's history
 * 2. Shows PCS AI the incorrectly parsed invoice alongside correct historical examples
 * 3. Asks PCS AI to analyze WHY parsing failed by comparing patterns
 * 4. Updates the master prompt to prevent similar errors
 * 5. Adds the corrected invoice to the history database
 */
export async function trainFromCorrection(input: TrainingInput): Promise<TrainingResult> {
  const { vendorName, pdfPath, originalParsed, correctedData } = input;

  try {
    // Extract user comment from corrected data (if present)
    const userComment = correctedData._user_comment as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _user_comment, ...cleanCorrectedData } = correctedData;
    
    console.log('[PCS-AI-TRAIN] User comment provided:', userComment ? `"${userComment}"` : 'none');

    // Get the training prompt
    const trainingPromptRecord = getTrainingPrompt();
    if (!trainingPromptRecord) {
      return {
        success: false,
        error: 'Training prompt not found in database',
        vendorName
      };
    }

    // Get current knowledge base (or create default)
    const currentKb = getOrCreateKnowledgeBase(vendorName);

    // Convert PDF to images
    console.log('[PCS-AI-TRAIN] Converting PDF for training:', pdfPath);
    const base64Images = await convertPdfToBase64Images(pdfPath);

    // Load historical examples to show PCS AI what correct parsing looks like
    const historicalExamples = getRecentHistory(vendorName, MAX_HISTORY_EXAMPLES);
    console.log(`[PCS-AI-TRAIN] Loaded ${historicalExamples.length} historical examples for analysis`);

    // Build enhanced training prompt with historical analysis
    let trainingPrompt = '';
    
    // Add user comment prominently at the TOP if provided
    if (userComment) {
      trainingPrompt += `⚠️ IMPORTANT USER INSTRUCTION FROM ADMIN:
"${userComment}"

The above message is from an admin who reviewed this invoice and made corrections. This instruction should be HEAVILY WEIGHTED when updating the knowledge base. The admin is telling you exactly what went wrong or what rule to add. Incorporate this feedback directly into the updated prompt.

---

`;
    }
    
    trainingPrompt += `CURRENT KNOWLEDGE BASE FOR ${vendorName}:
---
${currentKb.knowledge_prompt}
---

`;

    // Add historical examples section if available
    if (historicalExamples.length > 0) {
      trainingPrompt += `HISTORICAL CORRECTLY PARSED INVOICES FROM THIS VENDOR:
Below are ${historicalExamples.length} invoices that were previously parsed correctly. Analyze their patterns to understand why the new invoice was parsed incorrectly.

`;
      historicalExamples.forEach((example, idx) => {
        trainingPrompt += `--- Historical Example ${idx + 1} (Invoice: ${example.invoice_number || 'Unknown'}) ---
Correctly extracted data:
${JSON.stringify(example.parsed_data, null, 2)}

`;
      });
    }

    // Add the base training prompt with placeholders replaced
    trainingPrompt += trainingPromptRecord.prompt_text
      .replace('{{original_data}}', JSON.stringify(originalParsed, null, 2))
      .replace('{{corrected_data}}', JSON.stringify(cleanCorrectedData, null, 2));

    // Add analysis instructions
    trainingPrompt += `

ANALYSIS INSTRUCTIONS:
1. ${userComment ? 'FIRST AND FOREMOST: Follow the admin\'s instruction above - they know what went wrong' : 'Compare the incorrectly parsed invoice with the historical examples above'}
2. Identify WHY certain fields were extracted incorrectly:
   - Did the field location change on this invoice?
   - Was there a different format or labeling?
   - Were there multiple similar values that caused confusion?
3. Update the knowledge base prompt to handle this variation
4. Make the prompt MORE ROBUST to handle both the historical patterns AND this new variation
5. Return ONLY the updated knowledge base prompt text (no explanations)`;

    // Build message content with images
    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];
    
    messageContent.push({ type: 'text', text: trainingPrompt });
    
    // Add historical example images (low detail to save tokens)
    if (historicalExamples.length > 0) {
      messageContent.push({ type: 'text', text: '\n--- HISTORICAL EXAMPLE IMAGES (for pattern reference) ---' });
      for (let i = 0; i < historicalExamples.length; i++) {
        const example = historicalExamples[i];
        if (example.images.length > 0) {
          messageContent.push({ type: 'text', text: `Historical Example ${i + 1}:` });
          messageContent.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${example.images[0]}`, detail: 'low' }
          });
        }
      }
    }
    
    // Add the incorrectly parsed invoice image (uses configurable detail level)
    messageContent.push({ type: 'text', text: '\n--- INCORRECTLY PARSED INVOICE (analyze this) ---' });
    messageContent.push(...formatImagesForOpenAI(base64Images, PARSING_CONFIG.imageDetailLevel));

    // Call PCS AI to generate updated knowledge base
    console.log('[PCS-AI-TRAIN] Calling PCS AI for knowledge base update with historical analysis...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 3000,
      // Note: PCS AI only supports default temperature
      messages: [
        {
          role: 'user',
          content: messageContent
        }
      ]
    });

    const updatedPrompt = response.choices[0]?.message?.content?.trim();

    if (!updatedPrompt || updatedPrompt.length < 50) {
      return {
        success: false,
        error: 'PCS AI returned empty or too short response',
        vendorName
      };
    }

    // Update the knowledge base in the database
    console.log('[PCS-AI-TRAIN] Updating knowledge base in database...');
    const updated = upsertKnowledgeBase(vendorName, updatedPrompt, true);

    // Add the corrected invoice to history so future parsing can learn from it
    const invoiceNumber = correctedData.invoice_number || originalParsed.invoice_number || null;
    console.log('[PCS-AI-TRAIN] Adding corrected invoice to history...');
    addToHistory(
      vendorName,
      invoiceNumber,
      base64Images,
      {
        invoice_number: correctedData.invoice_number || null,
        invoice_date: correctedData.invoice_date || null,
        due_date: correctedData.due_date || null,
        vendor_name: vendorName,
        total: typeof correctedData.total === 'number' ? correctedData.total : parseFloat(correctedData.total) || null,
        office_location: correctedData.office_location || null,
        line_items: correctedData.line_items || []
      },
      true // was_corrected = true
    );

    console.log(`[PCS-AI-TRAIN] Knowledge base updated for ${vendorName}, version ${updated.version}`);

    return {
      success: true,
      updatedPrompt,
      vendorName,
      version: updated.version
    };

  } catch (error: any) {
    console.error('[PCS-AI-TRAIN] Training error:', error.message);
    return {
      success: false,
      error: error.message,
      vendorName
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse invoice from base64 images (for when images are already available)
 */
export async function parseInvoiceFromImages(
  base64Images: string[],
  vendorNameHint?: string | null
): Promise<ParseResult> {
  try {
    // Detect vendor if not provided
    let vendorName = vendorNameHint;
    if (!vendorName || vendorName === 'Unknown') {
      vendorName = await detectVendor(base64Images);
    }

    // Build the system prompt: Master Prompt + Vendor KB + Base Prompt
    let knowledgeBaseUsed = false;
    let systemPrompt = BASE_PARSING_PROMPT;
    let historicalExamples: HistoricalInvoice[] = [];

    // Load master parsing prompt with QBO data
    const masterPrompt = await buildMasterParsingPrompt();
    if (masterPrompt) {
      systemPrompt = masterPrompt + '\n\n' + systemPrompt;
      console.log('[PCS-AI] Using master parsing prompt with QBO data');
    }

    if (vendorName && vendorName !== 'Unknown') {
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        // Insert vendor KB between master and base prompts
        systemPrompt = (masterPrompt ? masterPrompt + '\n\n' : '') + 
                       kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
        knowledgeBaseUsed = true;
      }
      
      // Load historical examples
      historicalExamples = getRecentHistory(vendorName, MAX_HISTORY_EXAMPLES);
      if (historicalExamples.length > 0) {
        systemPrompt += formatHistoryForPrompt(historicalExamples);
      }
    }

    // Build message content with historical examples + new invoice
    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];
    
    messageContent.push({ 
      type: 'text', 
      text: historicalExamples.length > 0 
        ? `Below are ${historicalExamples.length} historical examples followed by the NEW invoice to parse. Parse ONLY the NEW invoice. Return only JSON.`
        : 'Parse this invoice and extract all fields. Return only JSON.'
    });
    
    // Add historical example images
    for (let i = 0; i < historicalExamples.length; i++) {
      const example = historicalExamples[i];
      if (example.images.length > 0) {
        messageContent.push({ type: 'text', text: `--- Example ${i + 1} ---` });
        messageContent.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${example.images[0]}`, detail: 'low' }
        });
      }
    }
    
    if (historicalExamples.length > 0) {
      messageContent.push({ type: 'text', text: '--- NEW INVOICE TO PARSE ---' });
    }
    
    messageContent.push(...formatImagesForOpenAI(base64Images, PARSING_CONFIG.imageDetailLevel));

    // Call PCS AI (with retry logic)
    const response = await withRetry(async () => {
      return await getOpenAIClient().chat.completions.create({
        model: GPT_MODEL,
        max_completion_tokens: PARSING_CONFIG.maxCompletionTokens,
        // Note: PCS AI only supports default temperature
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: messageContent
          }
        ]
      });
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    
    // Parse JSON
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsedData = JSON.parse(jsonStr.trim()) as ParsedInvoice;

    return {
      success: true,
      data: {
        ...parsedData,
        vendor_name: parsedData.vendor_name || vendorName || null,
        raw_response: rawResponse
      },
      vendorDetected: vendorName || undefined,
      knowledgeBaseUsed
    };

  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}

// ============================================================================
// PDF Similarity Comparison
// ============================================================================

export interface SimilarityResult {
  similar: boolean;
  confidence: number;
  reason: string;
}

const SIMILARITY_PROMPT = `You are comparing two invoice images to determine if they are from the same vendor and have the same general layout/format.

Compare the two images and assess:
1. Are they from the same company/vendor?
2. Do they have the same general layout and structure?
3. Are field positions (invoice number, total, dates) in similar locations?

Respond with a JSON object:
{
  "similar": true/false,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}

Return ONLY the JSON, no other text.`;

/**
 * Compare two PDFs to determine if they have similar layouts/formats
 * Used to identify invoices that could benefit from the same knowledge base updates
 */
export async function comparePdfSimilarity(
  referencePdfPath: string,
  candidatePdfPath: string
): Promise<SimilarityResult> {
  try {
    // Convert both PDFs to images (first page only for speed)
    console.log('[PCS-AI-SIMILARITY] Comparing PDFs:', { reference: referencePdfPath, candidate: candidatePdfPath });
    
    const [refImages, candImages] = await Promise.all([
      convertPdfToBase64Images(referencePdfPath),
      convertPdfToBase64Images(candidatePdfPath)
    ]);

    if (refImages.length === 0 || candImages.length === 0) {
      return {
        similar: false,
        confidence: 0,
        reason: 'Could not convert one or both PDFs to images'
      };
    }

    // Send both first pages to PCS AI for comparison
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SIMILARITY_PROMPT },
            { type: 'text', text: 'REFERENCE INVOICE (recently updated):' },
            { 
              type: 'image_url', 
              image_url: { url: `data:image/png;base64,${refImages[0]}`, detail: 'low' } 
            },
            { type: 'text', text: 'CANDIDATE INVOICE (check if similar):' },
            { 
              type: 'image_url', 
              image_url: { url: `data:image/png;base64,${candImages[0]}`, detail: 'low' } 
            }
          ]
        }
      ]
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    console.log('[PCS-AI-SIMILARITY] Raw response:', rawResponse);

    // Parse JSON response
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim()) as SimilarityResult;
    return {
      similar: result.similar === true,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reason: result.reason || 'No reason provided'
    };

  } catch (error: any) {
    console.error('[PCS-AI-SIMILARITY] Error comparing PDFs:', error.message);
    return {
      similar: false,
      confidence: 0,
      reason: `Error: ${error.message}`
    };
  }
}

/**
 * Test PCS AI connection
 */
export async function testGPTConnection(): Promise<{ connected: boolean; model: string; error?: string }> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 10,
      messages: [
        { role: 'user', content: 'Say "OK"' }
      ]
    });

    return {
      connected: true,
      model: GPT_MODEL
    };
  } catch (error: any) {
    return {
      connected: false,
      model: GPT_MODEL,
      error: error.message
    };
  }
}
