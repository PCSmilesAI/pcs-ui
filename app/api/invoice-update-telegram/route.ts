import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isPathWithinBase } from '../../../lib/security/path-validation';

// Telegram Bot Configuration (same as feedback route)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8510224399:AAE3eSpOefm8xNsp56Dm5TV8McUwA3Mhjw8';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5269556556';

interface GLLine {
  categoryName: string;
  className: string | null;
  amount: number;
  description: string | null;
}

interface InvoiceState {
  vendor_name: string;
  office_id: string;
  amount_cents: number;
  invoice_date: string;
  due_date: string;
  glLines: GLLine[];
}

interface InvoiceUpdatePayload {
  invoiceId: string;
  invoiceNumber: string;
  userComment: string;
  pdfPath: string;
  before: InvoiceState;
  after: InvoiceState;
}

/**
 * Send a text message to Telegram
 */
async function sendTextToTelegram(text: string): Promise<boolean> {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Telegram API error:', data);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send text to Telegram:', error);
    return false;
  }
}

/**
 * Send a document (PDF) to Telegram
 */
async function sendDocumentToTelegram(
  filePath: string, 
  fileName: string,
  caption?: string
): Promise<boolean> {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
  
  try {
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Create form data
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);
    if (caption) {
      formData.append('caption', caption.substring(0, 1024)); // Telegram caption limit
    }

    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Telegram document API error:', data);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send document to Telegram:', error);
    return false;
  }
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format amount from cents to dollars
 */
function formatAmount(cents: number): string {
  if (!cents && cents !== 0) return 'N/A';
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format GL lines for display
 */
function formatGLLines(lines: GLLine[]): string {
  if (!lines || lines.length === 0) {
    return '  (No GL lines)';
  }
  
  return lines.map((line, idx) => {
    const account = line.categoryName || '(No account)';
    const className = line.className || '(No class)';
    const amount = `$${(line.amount || 0).toFixed(2)}`;
    const desc = line.description ? ` - ${line.description}` : '';
    return `  ${idx + 1}. ${escapeHtml(account)} | ${escapeHtml(className)} | ${amount}${escapeHtml(desc)}`;
  }).join('\n');
}

/**
 * Check if a value changed between before and after
 */
function hasChanged(before: string | number | null | undefined, after: string | number | null | undefined): boolean {
  const beforeStr = String(before || '');
  const afterStr = String(after || '');
  return beforeStr !== afterStr;
}

/**
 * Format the main update message
 */
function formatUpdateMessage(payload: InvoiceUpdatePayload): string {
  const { invoiceNumber, userComment, before, after } = payload;
  
  let message = `<b>📋 INVOICE UPDATE</b>\n\n`;
  message += `<b>Invoice:</b> ${escapeHtml(invoiceNumber)}\n`;
  
  if (userComment && userComment.trim()) {
    message += `\n<b>User Comment:</b>\n${escapeHtml(userComment)}\n`;
  }
  
  message += `\n─────────────────\n`;
  message += `<b>📊 HEADER CHANGES</b>\n`;
  message += `─────────────────\n`;
  
  // Vendor
  if (hasChanged(before.vendor_name, after.vendor_name)) {
    message += `<b>Vendor:</b> ${escapeHtml(before.vendor_name || 'N/A')} → ${escapeHtml(after.vendor_name || 'N/A')}\n`;
  } else {
    message += `Vendor: ${escapeHtml(after.vendor_name || 'N/A')} (unchanged)\n`;
  }
  
  // Office
  if (hasChanged(before.office_id, after.office_id)) {
    message += `<b>Office:</b> ${escapeHtml(before.office_id || 'N/A')} → ${escapeHtml(after.office_id || 'N/A')}\n`;
  } else {
    message += `Office: ${escapeHtml(after.office_id || 'N/A')} (unchanged)\n`;
  }
  
  // Amount
  if (hasChanged(before.amount_cents, after.amount_cents)) {
    message += `<b>Amount:</b> ${formatAmount(before.amount_cents)} → ${formatAmount(after.amount_cents)}\n`;
  } else {
    message += `Amount: ${formatAmount(after.amount_cents)} (unchanged)\n`;
  }
  
  // Invoice Date
  if (hasChanged(before.invoice_date, after.invoice_date)) {
    message += `<b>Invoice Date:</b> ${escapeHtml(before.invoice_date || 'N/A')} → ${escapeHtml(after.invoice_date || 'N/A')}\n`;
  } else {
    message += `Invoice Date: ${escapeHtml(after.invoice_date || 'N/A')} (unchanged)\n`;
  }
  
  // Due Date
  if (hasChanged(before.due_date, after.due_date)) {
    message += `<b>Due Date:</b> ${escapeHtml(before.due_date || 'N/A')} → ${escapeHtml(after.due_date || 'N/A')}\n`;
  } else {
    message += `Due Date: ${escapeHtml(after.due_date || 'N/A')} (unchanged)\n`;
  }
  
  // GL Lines - Before (what was WRONG)
  message += `\n─────────────────\n`;
  message += `<b>📑 GL LINES - BEFORE (Original)</b>\n`;
  message += `─────────────────\n`;
  message += formatGLLines(before.glLines) + '\n';
  
  // GL Lines - After (what is RIGHT)
  message += `\n─────────────────\n`;
  message += `<b>📑 GL LINES - AFTER (Corrected)</b>\n`;
  message += `─────────────────\n`;
  message += formatGLLines(after.glLines) + '\n';
  
  return message;
}

/**
 * Resolve PDF path to absolute filesystem path
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;
  
  // Handle API route paths like /api/pdf/filename.pdf
  if (pdfPath.startsWith('/api/pdf/')) {
    const filename = pdfPath.replace('/api/pdf/', '');
    // Try multiple possible locations
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'email_invoices', filename),
      path.join(process.cwd(), 'email_invoices', filename),
      path.join(process.cwd(), 'public', filename),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }
  
  // Handle relative paths starting with /
  if (pdfPath.startsWith('/')) {
    const relativePath = pdfPath.substring(1);
    const fullPath = path.join(process.cwd(), 'public', relativePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    // Also try without 'public'
    const altPath = path.join(process.cwd(), relativePath);
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }
  
  // Handle paths like email_invoices/filename.pdf
  const publicPath = path.join(process.cwd(), 'public', pdfPath);
  if (fs.existsSync(publicPath)) {
    return publicPath;
  }
  
  // Direct path
  if (fs.existsSync(pdfPath)) {
    return pdfPath;
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload: InvoiceUpdatePayload = await request.json();

    // Validate required fields
    if (!payload.invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    console.log('📤 Sending invoice update to Telegram:', {
      invoiceId: payload.invoiceId,
      invoiceNumber: payload.invoiceNumber,
      hasComment: !!payload.userComment,
      hasPdf: !!payload.pdfPath,
    });

    // Format and send the main message
    const mainMessage = formatUpdateMessage(payload);
    
    // Telegram has a 4096 character limit, truncate if needed
    const truncatedMessage = mainMessage.length > 4000 
      ? mainMessage.substring(0, 3950) + '\n\n... (truncated)'
      : mainMessage;
    
    const textSent = await sendTextToTelegram(truncatedMessage);

    if (!textSent) {
      return NextResponse.json(
        { error: 'Failed to send update message to Telegram' },
        { status: 500 }
      );
    }

    // Send PDF if available
    let pdfSent = false;
    if (payload.pdfPath) {
      const resolvedPath = resolvePdfPath(payload.pdfPath);
      
      if (resolvedPath) {
        // Validate path is within allowed directories
        const baseDir = process.cwd();
        if (isPathWithinBase(resolvedPath, baseDir)) {
          // Small delay to ensure messages arrive in order
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const fileName = path.basename(resolvedPath);
          pdfSent = await sendDocumentToTelegram(
            resolvedPath, 
            fileName,
            `📎 Invoice PDF: ${payload.invoiceNumber || payload.invoiceId}`
          );
          
          if (!pdfSent) {
            console.warn('⚠️ Failed to send PDF to Telegram, but text message was sent');
          }
        } else {
          console.warn('⚠️ PDF path is outside allowed directory:', resolvedPath);
        }
      } else {
        console.warn('⚠️ Could not resolve PDF path:', payload.pdfPath);
      }
    }

    console.log('✅ Invoice update sent to Telegram:', {
      invoiceId: payload.invoiceId,
      textSent,
      pdfSent,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Invoice update sent to Telegram',
      textSent,
      pdfSent,
    });

  } catch (error) {
    console.error('❌ Invoice update Telegram API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'invoice-update-telegram',
    telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
  });
}

