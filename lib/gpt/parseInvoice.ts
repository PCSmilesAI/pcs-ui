import OpenAI from 'openai';
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

// Model configuration - use gpt-4o-mini for cost efficiency, gpt-4o for better accuracy
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

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
        console.log(`[GPT] Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms - Error: ${error.message}`);
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
 * Get list of QBO vendor names for GPT context
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
    
    console.log(`[GPT] Loaded ${vendorNames.length} QBO vendors for parsing context`);
    return vendorNames;
  } catch (error: any) {
    console.warn('[GPT] Failed to fetch QBO vendors:', error.message);
    // Return cached data if available, otherwise empty array
    return _vendorsCache?.data || [];
  }
}

/**
 * Get list of PCS location names (from QBO classes) for GPT context
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
    console.log('[GPT] No master parsing prompt found in database');
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
}

export interface ParseResult {
  success: boolean;
  data: ParsedInvoice | null;
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

/**
 * Detect the vendor from invoice images
 */
export async function detectVendor(base64Images: string[]): Promise<string> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VENDOR_DETECTION_PROMPT },
            ...formatImagesForOpenAI(base64Images)
          ]
        }
      ]
    });

    const vendorName = response.choices[0]?.message?.content?.trim() || 'Unknown';
    return vendorName;
  } catch (error: any) {
    console.error('[GPT] Vendor detection error:', error.message);
    return 'Unknown';
  }
}

// ============================================================================
// Invoice Parsing
// ============================================================================

const BASE_PARSING_PROMPT = `You are an expert invoice parser for dental practice management.

EXTRACTION SCHEMA - Return a JSON object with these exact fields:
{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
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
- Dates in YYYY-MM-DD format
- parsing_confidence: 1.0 = very confident, 0.5 = uncertain, 0.0 = guessing
- For office_location, look for "Ship To", "Deliver To", or dental office names

`;

/**
 * Parse an invoice PDF using GPT-4o vision
 */
export async function parseInvoiceWithGPT(
  pdfPath: string,
  vendorNameHint?: string | null
): Promise<ParseResult> {
  try {
    // Convert PDF to images
    console.log('[GPT] Converting PDF to images:', pdfPath);
    const base64Images = await convertPdfToBase64Images(pdfPath);
    console.log(`[GPT] Converted ${base64Images.length} page(s)`);

    // Detect vendor if not provided
    let vendorName = vendorNameHint;
    if (!vendorName || vendorName === 'Unknown') {
      console.log('[GPT] Detecting vendor...');
      vendorName = await detectVendor(base64Images);
      console.log('[GPT] Detected vendor:', vendorName);
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
      console.log('[GPT] Using master parsing prompt with QBO data');
    }

    if (vendorName && vendorName !== 'Unknown') {
      // Load vendor-specific knowledge base
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        // Insert vendor KB between master and base prompts
        systemPrompt = (masterPrompt ? masterPrompt + '\n\n' : '') + 
                       kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
        knowledgeBaseUsed = true;
        console.log(`[GPT] Using knowledge base for ${vendorName} (v${kb.version})`);
      } else {
        console.log(`[GPT] No knowledge base found for ${vendorName}, using default prompt`);
      }
      
      // Load historical examples for few-shot learning
      historicalExamples = getRecentHistory(vendorName, MAX_HISTORY_EXAMPLES);
      if (historicalExamples.length > 0) {
        const historyPrompt = formatHistoryForPrompt(historicalExamples);
        systemPrompt += historyPrompt;
        console.log(`[GPT] Including ${historicalExamples.length} historical examples for ${vendorName}`);
      } else {
        console.log(`[GPT] No historical examples available for ${vendorName}`);
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

    // Call GPT with images (with retry logic for robustness)
    console.log('[GPT] Calling GPT for parsing...');
    const response = await withRetry(async () => {
      return await getOpenAIClient().chat.completions.create({
        model: GPT_MODEL,
        max_completion_tokens: PARSING_CONFIG.maxCompletionTokens,
        // Note: GPT-5 nano only supports default temperature (1), so we don't set it
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
    console.log('[GPT] Raw response length:', rawResponse.length);

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
      console.error('[GPT] Failed to parse JSON response:', parseError.message);
      return {
        success: false,
        data: null,
        error: `Failed to parse GPT response as JSON: ${parseError.message}`,
        vendorDetected: vendorName || undefined,
        knowledgeBaseUsed
      };
    }

    console.log('[GPT] Successfully parsed invoice:', {
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
    console.error('[GPT] Invoice parsing error:', error.message);
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
 * 2. Shows GPT the incorrectly parsed invoice alongside correct historical examples
 * 3. Asks GPT to analyze WHY parsing failed by comparing patterns
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
    
    console.log('[GPT-TRAIN] User comment provided:', userComment ? `"${userComment}"` : 'none');

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
    console.log('[GPT-TRAIN] Converting PDF for training:', pdfPath);
    const base64Images = await convertPdfToBase64Images(pdfPath);

    // Load historical examples to show GPT what correct parsing looks like
    const historicalExamples = getRecentHistory(vendorName, MAX_HISTORY_EXAMPLES);
    console.log(`[GPT-TRAIN] Loaded ${historicalExamples.length} historical examples for analysis`);

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

    // Call GPT to generate updated knowledge base
    console.log('[GPT-TRAIN] Calling GPT for knowledge base update with historical analysis...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 3000,
      // Note: GPT-5 nano only supports default temperature
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
        error: 'GPT returned empty or too short response',
        vendorName
      };
    }

    // Update the knowledge base in the database
    console.log('[GPT-TRAIN] Updating knowledge base in database...');
    const updated = upsertKnowledgeBase(vendorName, updatedPrompt, true);

    // Add the corrected invoice to history so future parsing can learn from it
    const invoiceNumber = correctedData.invoice_number || originalParsed.invoice_number || null;
    console.log('[GPT-TRAIN] Adding corrected invoice to history...');
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

    console.log(`[GPT-TRAIN] Knowledge base updated for ${vendorName}, version ${updated.version}`);

    return {
      success: true,
      updatedPrompt,
      vendorName,
      version: updated.version
    };

  } catch (error: any) {
    console.error('[GPT-TRAIN] Training error:', error.message);
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
      console.log('[GPT] Using master parsing prompt with QBO data');
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

    // Call GPT (with retry logic)
    const response = await withRetry(async () => {
      return await getOpenAIClient().chat.completions.create({
        model: GPT_MODEL,
        max_completion_tokens: PARSING_CONFIG.maxCompletionTokens,
        // Note: GPT-5 nano only supports default temperature
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
    console.log('[GPT-SIMILARITY] Comparing PDFs:', { reference: referencePdfPath, candidate: candidatePdfPath });
    
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

    // Send both first pages to GPT for comparison
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
    console.log('[GPT-SIMILARITY] Raw response:', rawResponse);

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
    console.error('[GPT-SIMILARITY] Error comparing PDFs:', error.message);
    return {
      similar: false,
      confidence: 0,
      reason: `Error: ${error.message}`
    };
  }
}

/**
 * Test GPT connection
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
