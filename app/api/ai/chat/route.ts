import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAP } from '@/lib/workflow/rolesStore';
import { getDatabase } from '@/lib/db/client';

/**
 * Chat with PCS AI about the current invoice
 * POST /api/ai/chat
 * 
 * Body:
 * {
 *   invoiceId: string,
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
        { error: 'Only admins and AP managers can chat with PCS AI' },
        { status: 403 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.GPT_MODEL || 'gpt-4o-mini';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'PCS AI is not configured. Please contact your administrator.' },
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

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Build context from invoice
    const db = getDatabase();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    let invoiceContext = `Current Invoice Details:\n`;
    invoiceContext += `- Invoice Number: ${invoice.invoice_number || 'N/A'}\n`;
    invoiceContext += `- Vendor: ${invoice.vendor_name || 'N/A'}\n`;
    invoiceContext += `- Amount: $${((invoice.amount_cents || 0) / 100).toFixed(2)}\n`;
    invoiceContext += `- Status: ${invoice.status || 'N/A'}\n`;
    invoiceContext += `- Invoice Date: ${invoice.invoice_date || 'N/A'}\n`;
    invoiceContext += `- Due Date: ${invoice.due_date || 'N/A'}\n`;
    
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
            invoiceContext += `\nLine Items (${lineItems.length} total):\n`;
            lineItems.slice(0, 10).forEach((item: any, idx: number) => {
              const desc = item.description || item.product_name || item.name || 'Item';
              const qty = item.quantity || item.qty || 1;
              const price = item.unit_price || item.price || item.amount || 0;
              invoiceContext += `  ${idx + 1}. ${desc} (Qty: ${qty}, Price: $${Number(price).toFixed(2)})\n`;
            });
            if (lineItems.length > 10) {
              invoiceContext += `  ... and ${lineItems.length - 10} more items\n`;
            }
          }
        }
      } catch (err) {
        // Ignore errors loading line items
      }
    }

    // Add categories if available
    try {
      const categories = db.prepare(`
        SELECT ic.*, c.name as category_name, cl.name as class_name
        FROM invoice_categories ic
        LEFT JOIN categories c ON ic.category_id = c.qbo_id
        LEFT JOIN classes cl ON ic.class_id = cl.qbo_id
        WHERE ic.invoice_id = ?
      `).all(invoiceId) as any[];
      
      if (categories.length > 0) {
        invoiceContext += `\nCurrent Categorization:\n`;
        categories.forEach((cat, idx) => {
          invoiceContext += `  ${idx + 1}. ${cat.category_name || 'Unknown'} - ${cat.class_name || 'No Class'}: $${((cat.amount_cents || 0) / 100).toFixed(2)}\n`;
        });
      }
    } catch (err) {
      // Ignore errors loading categories
    }

    // System prompt that focuses only on the current invoice
    const systemPrompt = `You are PCS AI, an intelligent assistant for Pacific Crest Smiles dental practice invoice management system.

Your role is to help users understand and work with the CURRENT invoice they are viewing. You have access to all the details of this specific invoice.

IMPORTANT RULES:
1. You can ONLY answer questions about the current invoice shown below. 
2. If the user asks about other invoices, general topics, or anything not related to this specific invoice, politely respond: "I can only help you with the invoice you're currently viewing. Please navigate to another invoice if you'd like help with that one."
3. Be helpful, concise, and professional.
4. You can help with: understanding line items, explaining charges, suggesting categorizations, identifying potential issues with the invoice, and answering questions about the vendor or amounts.

${invoiceContext}`;

    // Build messages for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API][AI][CHAT] OpenAI error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to get response from PCS AI. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    console.log('[API][AI][CHAT]', {
      invoiceId,
      userEmail: user.email,
      messageLength: message.length,
      responseLength: assistantMessage.length,
      model: data.model,
    });

    return NextResponse.json({
      success: true,
      response: assistantMessage,
      model: data.model,
    });
  } catch (error: any) {
    console.error('[API][AI][CHAT] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get PCS AI response' },
      { status: 500 }
    );
  }
}
