import OpenAI from 'openai';
import { convertPdfToBase64Images, formatImagesForOpenAI } from './pdfToImages';
import { getKnowledgeBase, getOrCreateKnowledgeBase, getTrainingPrompt, upsertKnowledgeBase } from './knowledgeBase';

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
      max_tokens: 100,
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

    if (vendorName && vendorName !== 'Unknown') {
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        systemPrompt = kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
        knowledgeBaseUsed = true;
        console.log(`[GPT] Using knowledge base for ${vendorName} (v${kb.version})`);
      } else {
        console.log(`[GPT] No knowledge base found for ${vendorName}, using default prompt`);
      }
    }

    // Call GPT-4o with images
    console.log('[GPT] Calling GPT-4o for parsing...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for consistent parsing
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Parse this invoice and extract all fields. Return only JSON.' },
            ...formatImagesForOpenAI(base64Images)
          ]
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

    // Build the training prompt with placeholders replaced
    let trainingPrompt = trainingPromptRecord.prompt_text
      .replace('{{original_data}}', JSON.stringify(originalParsed, null, 2))
      .replace('{{corrected_data}}', JSON.stringify(correctedData, null, 2));

    // Add current knowledge base context
    trainingPrompt = `CURRENT KNOWLEDGE BASE FOR ${vendorName}:
---
${currentKb.knowledge_prompt}
---

${trainingPrompt}`;

    // Call GPT-4o to generate updated knowledge base
    console.log('[GPT-TRAIN] Calling GPT-4o for knowledge base update...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 3000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: trainingPrompt },
            ...formatImagesForOpenAI(base64Images)
          ]
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

    // Get knowledge base
    let knowledgeBaseUsed = false;
    let systemPrompt = BASE_PARSING_PROMPT;

    if (vendorName && vendorName !== 'Unknown') {
      const kb = getKnowledgeBase(vendorName);
      if (kb) {
        systemPrompt = kb.knowledge_prompt + '\n\n' + BASE_PARSING_PROMPT;
        knowledgeBaseUsed = true;
      }
    }

    // Call GPT-4o
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Parse this invoice and extract all fields. Return only JSON.' },
            ...formatImagesForOpenAI(base64Images)
          ]
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
      max_tokens: 10,
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
