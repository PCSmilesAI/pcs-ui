import OpenAI from 'openai';
import { convertPdfToBase64Images, formatImagesForOpenAI } from './pdfToImages';
import { getKnowledgeBase, getOrCreateKnowledgeBase, getTrainingPrompt, upsertKnowledgeBase } from './knowledgeBase';
import { getRecentHistory, formatHistoryForPrompt, addToHistory, MAX_HISTORY_EXAMPLES, type HistoricalInvoice } from './vendorHistory';

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

    // Get or create knowledge base for this vendor
    let knowledgeBaseUsed = false;
    let systemPrompt = BASE_PARSING_PROMPT;
    let historicalExamples: HistoricalInvoice[] = [];

    if (vendorName && vendorName !== 'Unknown') {
      // Load knowledge base
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        systemPrompt = kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
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
    
    // Add new invoice images (high detail for accuracy)
    messageContent.push(...formatImagesForOpenAI(base64Images));

    // Call GPT with images
    console.log('[GPT] Calling GPT for parsing...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 2000,
      temperature: 0.1, // Low temperature for consistent parsing
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
    let trainingPrompt = `CURRENT KNOWLEDGE BASE FOR ${vendorName}:
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
      .replace('{{corrected_data}}', JSON.stringify(correctedData, null, 2));

    // Add analysis instructions
    trainingPrompt += `

ANALYSIS INSTRUCTIONS:
1. Compare the incorrectly parsed invoice with the historical examples above
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
    
    // Add the incorrectly parsed invoice image (high detail for analysis)
    messageContent.push({ type: 'text', text: '\n--- INCORRECTLY PARSED INVOICE (analyze this) ---' });
    messageContent.push(...formatImagesForOpenAI(base64Images));

    // Call GPT to generate updated knowledge base
    console.log('[GPT-TRAIN] Calling GPT for knowledge base update with historical analysis...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 3000,
      temperature: 0.3,
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

    // Get knowledge base and historical examples
    let knowledgeBaseUsed = false;
    let systemPrompt = BASE_PARSING_PROMPT;
    let historicalExamples: HistoricalInvoice[] = [];

    if (vendorName && vendorName !== 'Unknown') {
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        systemPrompt = kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
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
    
    messageContent.push(...formatImagesForOpenAI(base64Images));

    // Call GPT
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 2000,
      temperature: 0.1,
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
