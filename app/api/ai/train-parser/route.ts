import { NextRequest, NextResponse } from 'next/server';
import { createLocalLLMClient } from '@/lib/ai/localLLMClient';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAP } from '@/lib/workflow/rolesStore';

/**
 * Train the parser using local LLM
 * POST /api/ai/train-parser
 * 
 * Body:
 * {
 *   invoiceId: string,
 *   originalValues: { [field: string]: any },
 *   correctedValues: { [field: string]: any },
 *   vendorName: string,
 *   lineItems?: any[],
 *   pdfContext?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Only admins and AP managers can train
    const isAuthorized = await isAP(user.email);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Only admins and AP managers can train the parser' },
        { status: 403 }
      );
    }

    const llmClient = createLocalLLMClient();
    if (!llmClient) {
      return NextResponse.json(
        { error: 'PCS AI is not configured. Please contact your administrator.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const {
      invoiceId,
      originalValues,
      correctedValues,
      vendorName,
      lineItems,
      pdfContext,
    } = body;

    if (!invoiceId || !originalValues || !correctedValues || !vendorName) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceId, originalValues, correctedValues, vendorName' },
        { status: 400 }
      );
    }

    // Identify changed fields
    const changedFields = Object.keys(correctedValues).filter(
      key => originalValues[key] !== correctedValues[key]
    );

    if (changedFields.length === 0) {
      return NextResponse.json(
        { error: 'No fields were changed' },
        { status: 400 }
      );
    }

    // Format training prompt
    const trainingPrompt = formatTrainingPrompt({
      invoiceId,
      originalValues,
      correctedValues,
      changedFields,
      vendorName,
      lineItems,
      pdfContext,
    });

    // Send to LLM
    const response = await llmClient.train(trainingPrompt);

    console.log('[API][AI][TRAIN_PARSER]', {
      invoiceId,
      vendorName,
      changedFields,
      userEmail: user.email,
      responseLength: response.content.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Training data sent to PCS AI',
      response: response.content.substring(0, 500), // Return first 500 chars
    });
  } catch (error: any) {
    console.error('[API][AI][TRAIN_PARSER] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to train parser' },
      { status: 500 }
    );
  }
}

function formatTrainingPrompt(data: {
  invoiceId: string;
  originalValues: Record<string, any>;
  correctedValues: Record<string, any>;
  changedFields: string[];
  vendorName: string;
  lineItems?: any[];
  pdfContext?: string;
}): string {
  const { originalValues, correctedValues, changedFields, vendorName, lineItems, pdfContext } = data;

  let prompt = `The parser extracted the following from an invoice PDF:\n\n`;
  
  prompt += `Vendor: ${vendorName}\n`;
  prompt += `Invoice ID: ${data.invoiceId}\n\n`;
  
  prompt += `Original parsed values:\n`;
  for (const field of changedFields) {
    prompt += `  ${field}: ${originalValues[field] || '(empty)'}\n`;
  }
  
  prompt += `\nThe correct values are:\n`;
  for (const field of changedFields) {
    prompt += `  ${field}: ${correctedValues[field] || '(empty)'}\n`;
  }
  
  if (lineItems && lineItems.length > 0) {
    prompt += `\nLine items from invoice:\n`;
    lineItems.slice(0, 5).forEach((item, idx) => {
      prompt += `  ${idx + 1}. ${item.description || item.product_name || item.name || 'Item'}\n`;
    });
  }
  
  if (pdfContext) {
    prompt += `\nPDF context (relevant text):\n${pdfContext.substring(0, 500)}\n`;
  }
  
  prompt += `\nPlease update your parsing logic to extract these fields correctly for similar invoices from ${vendorName} and other vendors.`;
  
  return prompt;
}

