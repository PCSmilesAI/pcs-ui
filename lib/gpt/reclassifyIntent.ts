/**
 * PCS AI Reclassification Intent Detector
 * 
 * Detects when a user's comment indicates they want to reclassify
 * a document (e.g., "this is a receipt, not an invoice") and moves
 * the document to the appropriate collection.
 */

import OpenAI from 'openai';
import { getDatabase } from '../db/client';
import { DocumentType } from './documentClassifier';

/**
 * Normalize a PDF path to the /api/pdf/filename.pdf format
 */
function normalizePdfPath(pdfPath: string | null | undefined): string | null {
  if (!pdfPath) return null;
  // Already in API format
  if (pdfPath.startsWith('/api/pdf/')) return pdfPath;
  // Extract filename from any path format
  const filename = pdfPath.split('/').pop();
  if (!filename) return null;
  return `/api/pdf/${filename}`;
}

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

export interface ReclassificationIntent {
  shouldReclassify: boolean;
  newDocumentType: DocumentType | null;
  confidence: number;
  reason: string;
}

export interface MoveResult {
  success: boolean;
  newId: string | null;
  error?: string;
}

// ============================================================================
// Intent Detection Prompt
// ============================================================================

const INTENT_DETECTION_PROMPT = `You are analyzing a user comment to determine if they want to RECLASSIFY a document.

The user is reviewing what was classified as an invoice. They may be making corrections to invoice fields (like fixing the vendor name or amount), OR they may be saying the document is NOT an invoice at all.

RECLASSIFICATION INDICATORS (user wants to change document type):
- "This is a receipt" / "This is just a receipt" / "reciept" (misspelling)
- "This is a credit memo" / "This is a credit"
- "This is a statement" / "This is an account statement"
- "Not an invoice" / "This isn't an invoice"
- "Move to other documents"
- "This is a payment confirmation"
- "Wrong document type"
- "This is marketing" / "This is junk"
- "Scanned receipt" / "scan receipt"

NON-RECLASSIFICATION (just correcting invoice fields):
- "The vendor name is wrong"
- "The amount should be $X"
- "Fix the date"
- "The invoice number is incorrect"
- Any comment about specific field values

DOCUMENT TYPES:
- receipt: Purchase receipts, transaction receipts, scanned receipts (USE THIS for "this is a receipt")
- credit_memo: Credit notes, refunds, credits applied
- statement: Account statements, balance summaries
- payment_confirmation: Payment confirmations, payment acknowledgments
- marketing: Promotional material, advertisements
- other: Anything else that's not an invoice

Return a JSON object:
{
  "shouldReclassify": true/false,
  "newDocumentType": "receipt" | "credit_memo" | "statement" | "payment_confirmation" | "marketing" | "other" | null,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation"
}

IMPORTANT: 
- If the user says "this is a receipt" (or any misspelling like "reciept"), set shouldReclassify=true and newDocumentType="receipt"
- Only set shouldReclassify to false if they're just making corrections to invoice fields.

Return ONLY valid JSON.`;

// ============================================================================
// Functions
// ============================================================================

/**
 * Detect if a user comment indicates a reclassification intent
 */
export async function detectReclassificationIntent(
  userComment: string
): Promise<ReclassificationIntent> {
  // Default response for empty comments
  if (!userComment || userComment.trim().length === 0) {
    return {
      shouldReclassify: false,
      newDocumentType: null,
      confidence: 1.0,
      reason: 'No comment provided'
    };
  }

  try {
    console.log('[PCS-AI-RECLASSIFY] Analyzing user comment for reclassification intent');

    const response = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      max_completion_tokens: 200,
      messages: [
        {
          role: 'system',
          content: INTENT_DETECTION_PROMPT
        },
        {
          role: 'user',
          content: `User comment: "${userComment}"`
        }
      ]
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    console.log('[PCS-AI-RECLASSIFY] Raw response:', rawResponse);

    if (!rawResponse || rawResponse.length === 0) {
      return {
        shouldReclassify: false,
        newDocumentType: null,
        confidence: 0,
        reason: 'PCS AI returned empty response'
      };
    }

    // Parse JSON response
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim()) as ReclassificationIntent;

    // Validate document type
    const validTypes: DocumentType[] = ['receipt', 'credit_memo', 'statement', 'payment_confirmation', 'packing_slip', 'letter', 'marketing', 'other'];
    if (result.newDocumentType && !validTypes.includes(result.newDocumentType)) {
      result.newDocumentType = 'other';
    }

    // Ensure confidence is valid
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      result.confidence = 0.5;
    }

    console.log('[PCS-AI-RECLASSIFY] Intent detection result:', {
      shouldReclassify: result.shouldReclassify,
      newDocumentType: result.newDocumentType,
      confidence: result.confidence
    });

    return result;

  } catch (error: any) {
    console.error('[PCS-AI-RECLASSIFY] Error detecting intent:', error.message);
    // On error, default to not reclassifying to avoid accidental moves
    return {
      shouldReclassify: false,
      newDocumentType: null,
      confidence: 0,
      reason: `Error: ${error.message}`
    };
  }
}

/**
 * Move an invoice to the other_documents table
 */
export async function moveInvoiceToOtherDocuments(
  invoiceId: string,
  documentType: DocumentType,
  actorEmail: string,
  notes: string
): Promise<MoveResult> {
  try {
    console.log('[PCS-AI-RECLASSIFY] Moving invoice to other_documents:', {
      invoiceId,
      documentType,
      actorEmail
    });

    const db = getDatabase();

    // Fetch the invoice
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      return {
        success: false,
        newId: null,
        error: 'Invoice not found'
      };
    }

    // Generate new ID for other_documents
    const newId = `reclassified_${invoiceId}_${Date.now()}`;
    const now = new Date().toISOString();

    // Normalize the PDF path to /api/pdf/filename.pdf format
    const normalizedPdfPath = normalizePdfPath(invoice.pdf_path);

    // Insert into other_documents
    db.prepare(`
      INSERT INTO other_documents (
        id, document_type, vendor_name, amount, document_date,
        reference_number, pdf_path, source_email_id, email_subject,
        email_from, classification_confidence, raw_extracted_data,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      documentType,
      invoice.vendor_name || invoice.parsed_vendor_name || null,
      invoice.amount_cents ? invoice.amount_cents / 100 : null,
      invoice.invoice_date || null,
      invoice.invoice_number || null,
      normalizedPdfPath,
      invoice.source_message_id || null,
      invoice.email_subject || null,
      invoice.email_from || null,
      1.0, // High confidence since user manually reclassified
      JSON.stringify({
        original_invoice_id: invoiceId,
        reclassified_by: actorEmail,
        reclassified_at: now,
        user_notes: notes,
        original_data: {
          vendor_name: invoice.vendor_name,
          amount_cents: invoice.amount_cents,
          invoice_number: invoice.invoice_number,
          status: invoice.status
        }
      }),
      'reviewed', // Mark as reviewed since user manually classified it
      `Reclassified from invoice by ${actorEmail}: ${notes}`,
      now,
      now
    );

    // Delete associated records BEFORE deleting the invoice (foreign key constraints)
    // Delete invoice_events first (has FK to invoices)
    db.prepare('DELETE FROM invoice_events WHERE invoice_id = ?').run(invoiceId);
    
    // Delete invoice_categories
    db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(invoiceId);
    
    // Now delete the invoice itself
    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);

    console.log('[PCS-AI-RECLASSIFY] Successfully moved invoice to other_documents:', {
      originalId: invoiceId,
      newId,
      documentType
    });

    return {
      success: true,
      newId
    };

  } catch (error: any) {
    console.error('[PCS-AI-RECLASSIFY] Error moving invoice:', error.message);
    return {
      success: false,
      newId: null,
      error: error.message
    };
  }
}

/**
 * Get display name for document type
 */
export function getDocumentTypeDisplayName(type: DocumentType): string {
  const displayNames: Record<DocumentType, string> = {
    'invoice': 'Invoice',
    'receipt': 'Receipt',
    'credit_memo': 'Credit Memo',
    'statement': 'Statement',
    'payment_confirmation': 'Payment Confirmation',
    'packing_slip': 'Packing Slip',
    'letter': 'Letter',
    'marketing': 'Marketing',
    'other': 'Other Document'
  };
  return displayNames[type] || 'Unknown';
}
