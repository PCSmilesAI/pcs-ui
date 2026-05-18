import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8510224399:AAE3eSpOefm8xNsp56Dm5TV8McUwA3Mhjw8';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5269556556';

// Rift Bot Configuration
const RIFT_BOT_API_KEY = process.env.RIFT_BOT_API_KEY || 'rift_bot_cac5cb1c66a5c14326f08940203aad77a7a4245177320199';
const RIFT_API_URL = process.env.RIFT_API_URL || 'http://107.170.25.126:3001/api/v1/messages';
const RIFT_CHAT_ID = process.env.RIFT_CHAT_ID || 'rift_72f7abfdad152691ba3fdfc1d458aa22';

interface FeedbackPayload {
  type?: 'bug' | 'feature';
  message: string;
  url: string;
  consoleLogs: string;
  logCount: number;
  timestamp: string;
  userAgent: string;
  screenSize: string;
  userEmail?: string;
  userName?: string;
}

async function sendToTelegram(text: string): Promise<boolean> {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function sendToRift(text: string): Promise<boolean> {
  try {
    const response = await fetch(RIFT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-API-Key': RIFT_BOT_API_KEY,
      },
      body: JSON.stringify({ content: text, chat_id: RIFT_CHAT_ID }),
    });

    if (response.status < 300) {
      console.log('[Feedback] Rift notification sent');
      return true;
    }
    console.warn('[Feedback] Rift API error:', response.status, await response.text().catch(() => ''));
    return false;
  } catch (error) {
    console.warn('[Feedback] Failed to send to Rift:', error);
    return false;
  }
}

function resolveUser(payload: FeedbackPayload, cookieUser: { email: string; name: string }): { email: string; name: string } {
  const email = cookieUser.email || payload.userEmail || '';
  const name = cookieUser.name || payload.userName || '';
  return { email, name };
}

function formatBugReport(payload: FeedbackPayload, user: { email: string; name: string }): string {
  const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let browser = 'Unknown';
  if (payload.userAgent.includes('Chrome')) browser = 'Chrome';
  else if (payload.userAgent.includes('Firefox')) browser = 'Firefox';
  else if (payload.userAgent.includes('Safari')) browser = 'Safari';
  else if (payload.userAgent.includes('Edge')) browser = 'Edge';

  let os = 'Unknown';
  if (payload.userAgent.includes('Mac')) os = 'macOS';
  else if (payload.userAgent.includes('Windows')) os = 'Windows';
  else if (payload.userAgent.includes('Linux')) os = 'Linux';
  else if (payload.userAgent.includes('iPhone') || payload.userAgent.includes('iPad')) os = 'iOS';
  else if (payload.userAgent.includes('Android')) os = 'Android';

  const userLine = user.email
    ? `<b>User:</b> ${escapeHtml(user.name || user.email)} (${escapeHtml(user.email)})\n`
    : `<b>User:</b> Unknown\n`;

  let message = `<b>DEVELOPER FEEDBACK</b>\n\n`;
  message += userLine;
  message += `<b>Page:</b> ${escapeHtml(payload.url)}\n`;
  message += `<b>Time:</b> ${timestamp}\n`;
  message += `<b>Browser:</b> ${browser} on ${os}\n`;
  message += `<b>Screen:</b> ${payload.screenSize}\n\n`;
  message += `<b>Description:</b>\n${escapeHtml(payload.message)}\n`;

  return message;
}

function formatFeatureRequest(payload: FeedbackPayload, user: { email: string; name: string }): string {
  const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const userLine = user.email
    ? `<b>User:</b> ${escapeHtml(user.name || user.email)} (${escapeHtml(user.email)})\n`
    : `<b>User:</b> Unknown\n`;

  let message = `<b>FEATURE REQUEST</b>\n\n`;
  message += userLine;
  message += `<b>From Page:</b> ${escapeHtml(payload.url)}\n`;
  message += `<b>Time:</b> ${timestamp}\n\n`;
  message += `<b>Request:</b>\n${escapeHtml(payload.message)}\n`;

  return message;
}

function formatRiftMessage(payload: FeedbackPayload, user: { email: string; name: string }): string {
  const feedbackType = payload.type || 'bug';
  const typeLabel = feedbackType === 'feature' ? 'Feature Request' : 'Developer Feedback';
  const userLabel = user.email ? `${user.name || user.email} (${user.email})` : 'Unknown user';

  let msg = `📋 **${typeLabel}**\n`;
  msg += `👤 ${userLabel}\n`;
  msg += `📍 ${payload.url}\n\n`;
  msg += payload.message;

  return msg;
}

function formatConsoleLogs(payload: FeedbackPayload): string | null {
  if (!payload.consoleLogs || payload.consoleLogs.trim() === '') {
    return null;
  }

  let logs = payload.consoleLogs;
  const maxLength = 3500;
  if (logs.length > maxLength) {
    logs = logs.substring(logs.length - maxLength);
    logs = '... (truncated)\n' + logs;
  }

  let message = `<b>Console Logs (${payload.logCount} entries)</b>\n\n`;
  message += `<pre>${escapeHtml(logs)}</pre>`;

  return message;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const payload: FeedbackPayload = await request.json();

    if (!payload.message || payload.message.trim() === '') {
      return NextResponse.json(
        { error: 'Feedback message is required' },
        { status: 400 }
      );
    }

    // Extract user identity from cookies (server-side verification)
    const cookieUser = getCurrentUser(request);
    const user = resolveUser(payload, cookieUser);

    const feedbackType = payload.type || 'bug';

    // Format messages
    const mainMessage = feedbackType === 'feature' 
      ? formatFeatureRequest(payload, user)
      : formatBugReport(payload, user);

    const riftMessage = formatRiftMessage(payload, user);

    // Send to Telegram and Rift in parallel
    const [telegramSent] = await Promise.all([
      sendToTelegram(mainMessage),
      sendToRift(riftMessage),
    ]);

    if (!telegramSent) {
      return NextResponse.json(
        { error: 'Failed to send feedback to Telegram' },
        { status: 500 }
      );
    }

    // Send console logs as a separate Telegram message for bug reports
    if (feedbackType === 'bug') {
      const logsMessage = formatConsoleLogs(payload);
      if (logsMessage) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendToTelegram(logsMessage);
      }
    }

    console.log(`[Feedback] ${feedbackType === 'feature' ? 'Feature request' : 'Bug report'} from ${user.email || 'unknown'} sent successfully (page: ${payload.url})`);

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

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'feedback',
    telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
  });
}
