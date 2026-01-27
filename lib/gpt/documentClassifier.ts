/**
 * PCS AI Document Classifier
 * 
 * Classifies documents into types (invoice, credit_memo, statement, etc.)
 * before routing to appropriate processing pipelines.
 */

import OpenAI from 'openai';
import { convertPdfToBase64Images, formatImagesForOpenAI } from './pdfToImages';

// Lazy initialization of OpenAI client
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

const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

// ============================================================================
// Types
// ============================================================================

export type DocumentType = 
  | 'invoice' 
  | 'credit_memo' 
  | 'statement' 
  | 'payment_confirmation' 
  | 'receipt'
  | 'marketing' 
  | 'other';

export interface EmailContext {
  subject?: string;
  from?: string;
  body?: string;
}

export interface ClassificationResult {
  document_type: DocumentType;
  confidence: number;
  vendor_name: string | null;
  amount: number | null;
  document_date: string | null;
  reference_number: string | null;
  reasoning: string;
}

export interface ClassificationResponse {
  success: boolean;
  result: ClassificationResult | null;
  error?: string;
}

// ============================================================================
// Classification Prompt
// ============================================================================

const CLASSIFICATION_PROMPT = `You are analyzing a document to determine its type and extract basic information.

DOCUMENT TYPES:
- invoice: A bill requesting payment for goods/services. Look for "INVOICE" header, itemized charges, "Amount Due", "Total Due"
- credit_memo: A credit/refund document reducing amount owed. Look for "CREDIT MEMO", "CREDIT", negative amounts, "Credit Balance"
- statement: An account statement showing balance/activity summary. Look for "STATEMENT", "Account Summary", multiple transaction dates, "Previous Balance"
- payment_confirmation: Confirmation that a payment was received. Look for "Payment Received", "Thank you for your payment", "Payment Confirmation"
- marketing: Promotional/advertising material. Look for promotional language, no financial data, product advertisements
- other: Does not fit any above category

KEY INDICATORS:
- If the document has "INVOICE" prominently displayed and shows items with prices = invoice
- If the document shows "CREDIT" or has negative amount adjustments = credit_memo
- If the document shows account history with multiple dates and running balance = statement
- If the document confirms a payment was made = payment_confirmation
- If the document has no financial transaction data and appears promotional = marketing

EXTRACTION RULES:
- vendor_name: The company that issued this document (look at letterhead, "From", logo)
- amount: The total/primary amount on the document (could be negative for credits)
- document_date: The date of the document (look for "Date", "Invoice Date", "Statement Date")
- reference_number: Any identifying number (Invoice #, Credit Memo #, Statement #, Confirmation #)

Return a JSON object with these exact fields:
{
  "document_type": "invoice" | "credit_memo" | "statement" | "payment_confirmation" | "marketing" | "other",
  "confidence": 0.0 to 1.0,
  "vendor_name": "string or null",
  "amount": number or null,
  "document_date": "YYYY-MM-DD or null",
  "reference_number": "string or null",
  "reasoning": "Brief explanation of why this classification was chosen"
}

Return ONLY valid JSON, no explanation text outside the JSON.`;

// ============================================================================
// Classification Function
// ============================================================================

/**
 * Classify a document using PCS AI vision
 */
export async function classifyDocument(
  pdfPath: string,
  emailContext?: EmailContext
): Promise<ClassificationResponse> {
  try {
    console.log('[PCS-AI-CLASSIFY] Classifying document:', pdfPath);

    // Convert PDF to images
    const base64Images = await convertPdfToBase64Images(pdfPath);
    if (base64Images.length === 0) {
      return {
        success: false,
        result: null,
        error: 'Failed to convert PDF to images'
      };
    }
    console.log(`[PCS-AI-CLASSIFY] Converted ${base64Images.length} page(s)`);

    // Build message content
    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];

    // Add email context if provided
    if (emailContext && (emailContext.subject || emailContext.from || emailContext.body)) {
      let contextText = 'EMAIL CONTEXT:\n';
      if (emailContext.subject) contextText += `- Subject: ${emailContext.subject}\n`;
      if (emailContext.from) contextText += `- From: ${emailContext.from}\n`;
      if (emailContext.body) {
        // Truncate body to first 500 chars
        const bodyPreview = emailContext.body.substring(0, 500);
        contextText += `- Body preview: ${bodyPreview}\n`;
      }
      contextText += '\nDOCUMENT IMAGE(S) ATTACHED BELOW:\n';
      messageContent.push({ type: 'text', text: contextText });
    } else {
      messageContent.push({ type: 'text', text: 'DOCUMENT IMAGE(S) TO CLASSIFY:\n' });
    }

    // Add document images (first 2 pages max for classification)
    const imagesToSend = base64Images.slice(0, 2);
    messageContent.push(...formatImagesForOpenAI(imagesToSend));

    // Call PCS AI
    console.log('[PCS-AI-CLASSIFY] Calling PCS AI for classification...');
    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 500,
      messages: [
        {
          role: 'system',
          content: CLASSIFICATION_PROMPT
        },
        {
          role: 'user',
          content: messageContent
        }
      ]
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    console.log('[PCS-AI-CLASSIFY] Raw response length:', rawResponse.length);

    if (!rawResponse || rawResponse.length === 0) {
      return {
        success: false,
        result: null,
        error: 'PCS AI returned empty response'
      };
    }

    // Parse JSON response
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim()) as ClassificationResult;

    // Validate document_type
    const validTypes: DocumentType[] = ['invoice', 'credit_memo', 'statement', 'payment_confirmation', 'receipt', 'marketing', 'other'];
    if (!validTypes.includes(result.document_type)) {
      result.document_type = 'other';
    }

    // Ensure confidence is a number between 0 and 1
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      result.confidence = 0.5;
    }

    console.log('[PCS-AI-CLASSIFY] Classification result:', {
      type: result.document_type,
      confidence: result.confidence,
      vendor: result.vendor_name,
      amount: result.amount
    });

    return {
      success: true,
      result
    };

  } catch (error: any) {
    console.error('[PCS-AI-CLASSIFY] Error:', error.message);
    return {
      success: false,
      result: null,
      error: error.message
    };
  }
}

/**
 * Quick check if a document is likely an invoice (for fast filtering)
 */
export async function isLikelyInvoice(
  pdfPath: string,
  emailContext?: EmailContext
): Promise<{ isInvoice: boolean; confidence: number }> {
  const result = await classifyDocument(pdfPath, emailContext);
  
  if (!result.success || !result.result) {
    // If classification fails, assume it might be an invoice to avoid losing documents
    return { isInvoice: true, confidence: 0.5 };
  }

  return {
    isInvoice: result.result.document_type === 'invoice',
    confidence: result.result.confidence
  };
}

/**
 * Get document type display name
 */
export function getDocumentTypeDisplayName(type: DocumentType): string {
  const displayNames: Record<DocumentType, string> = {
    'invoice': 'Invoice',
    'credit_memo': 'Credit Memo',
    'statement': 'Statement',
    'payment_confirmation': 'Payment Confirmation',
    'receipt': 'Receipt',
    'marketing': 'Marketing',
    'other': 'Other'
  };
  return displayNames[type] || 'Unknown';
}

/**
 * Get document type color for UI
 */
export function getDocumentTypeColor(type: DocumentType): { bg: string; text: string; border: string } {
  const colors: Record<DocumentType, { bg: string; text: string; border: string }> = {
    'invoice': { bg: '#e8f4fc', text: '#357ab2', border: '#357ab2' },
    'credit_memo': { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },
    'statement': { bg: '#e0f2fe', text: '#0369a1', border: '#38bdf8' },
    'payment_confirmation': { bg: '#dcfce7', text: '#16a34a', border: '#22c55e' },
    'receipt': { bg: '#fae8ff', text: '#a21caf', border: '#d946ef' },
    'marketing': { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' },
    'other': { bg: '#fef2f2', text: '#dc2626', border: '#f87171' }
  };
  return colors[type] || colors['other'];
}
