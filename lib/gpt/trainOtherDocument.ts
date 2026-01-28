/**
 * Train GPT-5 Nano on Other Document Types
 * 
 * This module handles training the AI to recognize non-invoice documents
 * from specific vendors (credit memos, statements, receipts, packing slips, etc.)
 */

import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import { convertPdfToBase64Images } from './pdfToImages';
import { getOrCreateKnowledgeBase, upsertKnowledgeBase } from './knowledgeBase';
import { DocumentType, getDocumentTypeDisplayName } from './documentClassifier';

// Lazy initialization of OpenAI client to avoid build-time errors
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

export interface OtherDocumentTrainingInput {
  vendorName: string;
  documentType: DocumentType;
  pdfPath: string;
  documentDate?: string;
  userNote?: string;
  extractedData?: Record<string, any>;
}

export interface OtherDocumentTrainingResult {
  success: boolean;
  error?: string;
  vendorName: string;
  documentType?: DocumentType;
  version?: number;
}

/**
 * The training prompt that teaches GPT how to update vendor knowledge bases
 * to recognize and handle non-invoice document types
 */
const OTHER_DOCUMENT_TRAINING_PROMPT = `You are updating a vendor's knowledge base to help an AI invoice parser recognize when a document is NOT an invoice.

CURRENT KNOWLEDGE BASE:
---
{{current_knowledge_base}}
---

DOCUMENT INFORMATION:
- Vendor: {{vendor_name}}
- Document Type: {{document_type}} ({{document_type_display}})
- User's Note: {{user_note}}
- Extracted Fields: {{extracted_data}}

YOUR TASK:
1. Analyze the attached document image(s) to understand its visual layout and key identifiers
2. Update the knowledge base to include a DOCUMENT TYPE RECOGNITION section
3. Add specific rules for identifying this {{document_type_display}} from {{vendor_name}}

IMPORTANT RULES TO ADD:
1. List the visual indicators that identify this as a {{document_type_display}} (not an invoice):
   - Header text patterns (e.g., "CREDIT MEMO", "STATEMENT", "RECEIPT")
   - Document layout differences from invoices
   - Specific fields or sections unique to this document type
   
2. Specify that when these indicators are detected, the document should be classified as "{{document_type}}" 
   and sent to the Other Documents page, NOT processed as an invoice

3. If there are any fields worth extracting from this document type (like credit amount, statement period, etc.),
   add parsing rules for those fields

OUTPUT REQUIREMENTS:
- Return ONLY the complete updated knowledge base prompt
- Keep all existing invoice parsing rules intact
- Add a new section called "DOCUMENT TYPE RECOGNITION" if it doesn't exist
- Be specific about patterns to look for from this particular vendor
- Do not include any explanations, just return the updated prompt text`;

/**
 * Train the vendor knowledge base to recognize a specific document type
 */
export async function trainFromOtherDocument(input: OtherDocumentTrainingInput): Promise<OtherDocumentTrainingResult> {
  const { vendorName, documentType, pdfPath, documentDate, userNote, extractedData } = input;

  try {
    console.log('[PCS-AI-TRAIN-OTHER] Training for document type recognition:', {
      vendor: vendorName,
      type: documentType,
      pdfPath
    });

    // Get current knowledge base (or create default)
    const currentKb = getOrCreateKnowledgeBase(vendorName);

    // Convert PDF to images for visual analysis
    let base64Images: string[] = [];
    if (pdfPath && fs.existsSync(pdfPath)) {
      console.log('[PCS-AI-TRAIN-OTHER] Converting PDF for analysis:', pdfPath);
      base64Images = await convertPdfToBase64Images(pdfPath);
    } else {
      console.warn('[PCS-AI-TRAIN-OTHER] PDF not found, training without images:', pdfPath);
    }

    // Build the training prompt
    const documentTypeDisplay = getDocumentTypeDisplayName(documentType);
    const trainingPrompt = OTHER_DOCUMENT_TRAINING_PROMPT
      .replace('{{current_knowledge_base}}', currentKb.knowledge_prompt)
      .replace(/\{\{vendor_name\}\}/g, vendorName)
      .replace(/\{\{document_type\}\}/g, documentType)
      .replace(/\{\{document_type_display\}\}/g, documentTypeDisplay)
      .replace('{{user_note}}', userNote || 'No additional notes provided')
      .replace('{{extracted_data}}', JSON.stringify({
        date: documentDate || null,
        ...extractedData
      }, null, 2));

    // Build message content with images
    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }> = [];
    
    messageContent.push({ type: 'text', text: trainingPrompt });
    
    // Add document images for visual analysis
    if (base64Images.length > 0) {
      messageContent.push({ type: 'text', text: '\n--- DOCUMENT IMAGES TO ANALYZE ---' });
      for (let i = 0; i < base64Images.length; i++) {
        messageContent.push({ type: 'text', text: `Page ${i + 1}:` });
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Images[i]}`,
            detail: 'high'
          }
        });
      }
    }

    // Call GPT-5 Nano to generate updated knowledge base
    console.log('[PCS-AI-TRAIN-OTHER] Calling GPT for knowledge base update...');
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a document parsing expert. You help train AI systems to correctly classify and parse dental industry documents. Always return ONLY the updated knowledge base prompt text, no explanations.'
        },
        {
          role: 'user',
          content: messageContent
        }
      ],
      max_tokens: 4000,
      temperature: 0.3
    });

    const updatedPrompt = response.choices[0]?.message?.content?.trim();
    
    if (!updatedPrompt || updatedPrompt.length < 100) {
      throw new Error('GPT returned invalid or empty knowledge base update');
    }

    // Verify the update includes document type recognition
    if (!updatedPrompt.toLowerCase().includes('document type') && 
        !updatedPrompt.toLowerCase().includes(documentType.toLowerCase())) {
      console.warn('[PCS-AI-TRAIN-OTHER] Warning: Updated prompt may not include document type rules');
    }

    // Save the updated knowledge base
    console.log('[PCS-AI-TRAIN-OTHER] Saving updated knowledge base...');
    const updatedKb = upsertKnowledgeBase(vendorName, updatedPrompt, true);

    console.log('[PCS-AI-TRAIN-OTHER] Knowledge base updated successfully:', {
      vendor: updatedKb.vendor_name,
      version: updatedKb.version,
      trainingCount: updatedKb.training_invoice_count
    });

    return {
      success: true,
      vendorName: updatedKb.vendor_name,
      documentType,
      version: updatedKb.version
    };

  } catch (error: any) {
    console.error('[PCS-AI-TRAIN-OTHER] Training error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during training',
      vendorName,
      documentType
    };
  }
}

/**
 * Check if a vendor's knowledge base has document type recognition rules
 */
export function hasDocumentTypeRecognition(vendorName: string): boolean {
  const kb = getOrCreateKnowledgeBase(vendorName);
  const prompt = kb.knowledge_prompt.toLowerCase();
  
  return prompt.includes('document type recognition') ||
         prompt.includes('credit memo') ||
         prompt.includes('statement') ||
         prompt.includes('receipt') ||
         prompt.includes('packing slip');
}

/**
 * Get a summary of document types a vendor's knowledge base can recognize
 */
export function getRecognizedDocumentTypes(vendorName: string): DocumentType[] {
  const kb = getOrCreateKnowledgeBase(vendorName);
  const prompt = kb.knowledge_prompt.toLowerCase();
  
  const types: DocumentType[] = [];
  
  if (prompt.includes('credit memo') || prompt.includes('credit_memo')) types.push('credit_memo');
  if (prompt.includes('statement')) types.push('statement');
  if (prompt.includes('receipt')) types.push('receipt');
  if (prompt.includes('packing slip') || prompt.includes('packing_slip')) types.push('packing_slip');
  if (prompt.includes('letter')) types.push('letter');
  if (prompt.includes('payment confirmation') || prompt.includes('payment_confirmation')) types.push('payment_confirmation');
  if (prompt.includes('marketing')) types.push('marketing');
  
  return types;
}
