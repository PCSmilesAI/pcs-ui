import { NextRequest, NextResponse } from 'next/server';

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8510224399:AAE3eSpOefm8xNsp56Dm5TV8McUwA3Mhjw8';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5269556556';

interface FeedbackPayload {
  type?: 'bug' | 'feature';
  message: string;
  url: string;
  consoleLogs: string;
  logCount: number;
  timestamp: string;
  userAgent: string;
  screenSize: string;
}

/**
 * Sends a message to Telegram using the Bot API
 */
async function sendToTelegram(text: string): Promise<boolean> {
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
    console.error('Failed to send to Telegram:', error);
    return false;
  }
}

/**
 * Formats a bug report into a readable Telegram message
 */
function formatBugReport(payload: FeedbackPayload): string {
  const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Parse browser from user agent
  let browser = 'Unknown';
  if (payload.userAgent.includes('Chrome')) browser = 'Chrome';
  else if (payload.userAgent.includes('Firefox')) browser = 'Firefox';
  else if (payload.userAgent.includes('Safari')) browser = 'Safari';
  else if (payload.userAgent.includes('Edge')) browser = 'Edge';

  // Parse OS from user agent
  let os = 'Unknown';
  if (payload.userAgent.includes('Mac')) os = 'macOS';
  else if (payload.userAgent.includes('Windows')) os = 'Windows';
  else if (payload.userAgent.includes('Linux')) os = 'Linux';
  else if (payload.userAgent.includes('iPhone') || payload.userAgent.includes('iPad')) os = 'iOS';
  else if (payload.userAgent.includes('Android')) os = 'Android';

  let message = `🐛 <b>BUG REPORT</b>\n\n`;
  message += `📍 <b>Page:</b> ${escapeHtml(payload.url)}\n`;
  message += `🕐 <b>Time:</b> ${timestamp}\n`;
  message += `💻 <b>Browser:</b> ${browser} on ${os}\n`;
  message += `📐 <b>Screen:</b> ${payload.screenSize}\n\n`;
  message += `💬 <b>Description:</b>\n${escapeHtml(payload.message)}\n`;

  return message;
}

/**
 * Formats a feature request into a readable Telegram message
 */
function formatFeatureRequest(payload: FeedbackPayload): string {
  const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let message = `💡 <b>FEATURE REQUEST</b>\n\n`;
  message += `📍 <b>From Page:</b> ${escapeHtml(payload.url)}\n`;
  message += `🕐 <b>Time:</b> ${timestamp}\n\n`;
  message += `✨ <b>Request:</b>\n${escapeHtml(payload.message)}\n`;

  return message;
}

/**
 * Formats console logs for a separate message (to avoid hitting Telegram's 4096 char limit)
 */
function formatConsoleLogs(payload: FeedbackPayload): string | null {
  if (!payload.consoleLogs || payload.consoleLogs.trim() === '') {
    return null;
  }

  // Truncate if too long (Telegram limit is 4096 chars)
  let logs = payload.consoleLogs;
  const maxLength = 3500; // Leave room for header
  
  if (logs.length > maxLength) {
    logs = logs.substring(logs.length - maxLength);
    logs = '... (truncated)\n' + logs;
  }

  let message = `📋 <b>Console Logs (${payload.logCount} entries)</b>\n\n`;
  message += `<pre>${escapeHtml(logs)}</pre>`;

  return message;
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const payload: FeedbackPayload = await request.json();

    // Validate required fields
    if (!payload.message || payload.message.trim() === '') {
      return NextResponse.json(
        { error: 'Feedback message is required' },
        { status: 400 }
      );
    }

    // Determine the type (default to 'bug' for backwards compatibility)
    const feedbackType = payload.type || 'bug';

    // Format the message based on type
    const mainMessage = feedbackType === 'feature' 
      ? formatFeatureRequest(payload)
      : formatBugReport(payload);

    const mainSent = await sendToTelegram(mainMessage);

    if (!mainSent) {
      return NextResponse.json(
        { error: 'Failed to send feedback to Telegram' },
        { status: 500 }
      );
    }

    // Send console logs as a separate message if they exist (only for bug reports)
    if (feedbackType === 'bug') {
      const logsMessage = formatConsoleLogs(payload);
      if (logsMessage) {
        // Small delay to ensure messages arrive in order
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendToTelegram(logsMessage);
      }
    }

    console.log(`${feedbackType === 'feature' ? 'Feature request' : 'Bug report'} sent successfully from ${payload.url}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Feedback sent successfully' 
    });

  } catch (error) {
    console.error('Feedback API error:', error);
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
    service: 'feedback',
    telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
  });
}
