import { NextRequest, NextResponse } from 'next/server';
import { createLocalLLMClient } from '@/lib/ai/localLLMClient';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAP } from '@/lib/workflow/rolesStore';
import { getDatabase } from '@/lib/db/client';

/**
 * Chat with local LLM about invoice parsing
 * POST /api/ai/chat
 * 
 * Body:
 * {
 *   invoiceId?: string,
 *   message: string,
 *   conversationHistory?: Array<{ role: string, content: string }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Only admins and AP managers can chat
    const isAuthorized = await isAP(user.email);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Only admins and AP managers can chat with the LLM' },
        { status: 403 }
      );
    }

    const llmClient = createLocalLLMClient();
    if (!llmClient) {
      return NextResponse.json(
        { error: 'Local LLM not configured. Please set up LOCAL_LLM_ENDPOINT and LOCAL_LLM_MODEL environment variables.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { invoiceId, message, conversationHistory = [] } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Build context from invoice if provided
    let invoiceContext = '';
    if (invoiceId) {
      const db = getDatabase();
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
      if (invoice) {
        invoiceContext = `\n\nInvoice Context:\n`;
        invoiceContext += `Invoice Number: ${invoice.invoice_number || 'N/A'}\n`;
        invoiceContext += `Vendor: ${invoice.vendor_name || 'N/A'}\n`;
        invoiceContext += `Amount: $${((invoice.amount_cents || 0) / 100).toFixed(2)}\n`;
        invoiceContext += `Status: ${invoice.status || 'N/A'}\n`;
        
        // Add line items if available
        if (invoice.json_path) {
          try {
            const fs = await import('fs');
            const { resolveDataPath } = await import('@/lib/workflow/dataDir');
            const jsonPath = resolveDataPath(invoice.json_path);
            if (fs.existsSync(jsonPath)) {
              const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
              const lineItems = jsonData.line_items || jsonData.lineItems || [];
              if (lineItems.length > 0) {
                invoiceContext += `\nLine Items:\n`;
                lineItems.slice(0, 5).forEach((item: any, idx: number) => {
                  invoiceContext += `  ${idx + 1}. ${item.description || item.product_name || item.name || 'Item'}\n`;
                });
              }
            }
          } catch (err) {
            // Ignore errors loading line items
          }
        }
      }
    }

    // Build messages
    const messages = [
      {
        role: 'system' as const,
        content: 'You are a helpful assistant that helps with invoice parsing and categorization. You can answer questions about parsing logic, categories, vendors, and help improve the accuracy of invoice extraction.',
      },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: invoiceContext ? `${invoiceContext}\n\nUser Question: ${message}` : message,
      },
    ];

    // Send to LLM
    const response = await llmClient.chat(messages);

    console.log('[API][AI][CHAT]', {
      invoiceId: invoiceId || null,
      userEmail: user.email,
      messageLength: message.length,
      responseLength: response.content.length,
    });

    return NextResponse.json({
      success: true,
      response: response.content,
      model: response.model,
    });
  } catch (error: any) {
    console.error('[API][AI][CHAT] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get LLM response' },
      { status: 500 }
    );
  }
}

