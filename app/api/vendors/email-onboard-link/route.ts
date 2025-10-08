import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import Mailjet from 'node-mailjet';
import { loadMap, findVendorKey, setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function isValidEmail(address: string | undefined | null) {
  if (!address) return false;
  return /.+@.+\..+/.test(address);
}

async function ensureStripeAccountAndLink(req: NextRequest, vendorParam: string, accountId?: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('stripe not configured');
  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

  let finalAccountId = (accountId || '').trim() || undefined;

  if (!finalAccountId) {
    const map = await loadMap();
    let key = findVendorKey(map, vendorParam) || vendorParam;
    if (vendorParam && !map.vendors[key]) {
      await setVendorStatus(key, {});
    }
    finalAccountId = map.vendors[key]?.stripeAccountId;
    if (!finalAccountId) {
      const acct = await stripe.accounts.create({
        type: 'custom',
        country: 'US',
        capabilities: { transfers: { requested: true } },
      });
      finalAccountId = acct.id;
      await setVendorStatus(key, { stripeAccountId: finalAccountId, ach_status: 'pending' });
    }
  }

  let url: string | null = null;
  try {
    const ll = await stripe.accounts.createLoginLink(finalAccountId);
    url = ll.url;
  } catch (_e) {
    const origin = req.headers.get('x-forwarded-proto') && req.headers.get('host')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
      : '';
    const refreshUrl = `${origin}/VendorsPage`;
    const returnUrl = `${origin}/VendorDetailPage?vendor=${encodeURIComponent(vendorParam || '')}`;
    const al = await stripe.accountLinks.create({
      account: finalAccountId!,
      type: 'account_onboarding',
      refresh_url: refreshUrl || 'https://example.com',
      return_url: returnUrl || 'https://example.com',
    });
    url = al.url;
  }

  if (!url) throw new Error('failed to create onboarding link');
  return { accountId: finalAccountId!, url };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vendor: string = (body.vendor || '').trim();
    const email: string = (body.email || '').trim();
    const accountId: string | undefined = (body.stripeAccountId || '').trim() || undefined;

    if (!vendor) return json(400, { ok: false, error: 'vendor required' });
    if (!isValidEmail(email)) return json(400, { ok: false, error: 'valid email required' });

    const { url, accountId: finalAccountId } = await ensureStripeAccountAndLink(req, vendor, accountId);

    const inferredHostFromImap = (() => {
      const imap = process.env.EMAIL_IMAP_SERVER || '';
      if (/secureserver\.net$/i.test(imap)) return 'smtp.secureserver.net';
      return '';
    })();
    const host = process.env.SMTP_HOST || process.env.EMAIL_SMTP_SERVER || inferredHostFromImap || '';
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_SMTP_PORT || 587);
    const secure = String((process.env.SMTP_SECURE ?? process.env.EMAIL_SMTP_SECURE) || '').toLowerCase() === 'true';
    const from = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@pcsmilesai.com';

    // Prepare email content used by both Mailjet and SMTP
    const baseSubject = `ACH Onboarding for ${vendor}`;
    const baseText = `Hello,\n\nPlease complete ACH onboarding for ${vendor} using the secure link below:\n\n${url}\n\nThis link is provided by PCS AI via Stripe. If you did not expect this email, please contact support.`;
    const baseHtml = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <p>Hello,</p>
        <p>Please complete ACH onboarding for <strong>${vendor}</strong> using the secure link below:</p>
        <p><a href="${url}" target="_blank" rel="noopener noreferrer">Complete ACH Onboarding</a></p>
        <p style="color:#6b7280;font-size:12px;">This link is provided by PCS AI via Stripe.</p>
      </div>
    `;

    const mjKey = process.env.MAILJET_API_KEY || '';
    const mjSecret = process.env.MAILJET_API_SECRET || '';

    // Prefer Mailjet HTTP API if keys provided (no SMTP ports required)
    if (mjKey && mjSecret) {
      try {
        const mj = Mailjet.apiConnect(mjKey, mjSecret);
        const fromEmail = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@pcsmilesai.com';
        const fromName = process.env.PCS_FROM_NAME || 'PCS AI';
        const req = await mj.post('send', { version: 'v3.1' }).request({
          Messages: [
            {
              From: { Email: fromEmail, Name: fromName },
              To: [{ Email: email }],
              Subject: baseSubject,
              TextPart: baseText,
              HTMLPart: baseHtml,
            },
          ],
        });
        const body: any = (req as any)?.body || {};
        const ok = body?.Messages?.[0]?.Status === 'success';
        if (ok) return json(200, { ok: true, sent: true, vendor, email, accountId: finalAccountId, url, provider: 'mailjet' });
        console.warn('[EMAIL_ONBOARD_LINK][Mailjet] Non-success response', req?.body);
      } catch (e: any) {
        console.error('[EMAIL_ONBOARD_LINK][Mailjet] Error', e?.message || e);
      }
    }

    if (!host || !user || !pass) {
      console.error('[EMAIL_ONBOARD_LINK] Missing SMTP env; returning link for manual sending');
      return json(200, { ok: true, sent: false, vendor, email, accountId: finalAccountId, url });
    }

    const subject = baseSubject;
    const text = baseText;
    const html = baseHtml;

    // Try multiple SMTP configs (primary then common GoDaddy variants)
    const attempts = [
      { host, port, secure },
      { host: host || 'smtpout.secureserver.net', port: 465, secure: true },
      { host: host || 'smtpout.secureserver.net', port: 587, secure: false },
      { host: host || 'smtp.secureserver.net', port: 587, secure: false },
    ];
    let lastErr: any = null;
    for (const cfg of attempts) {
      try {
        if (!cfg.host) continue;
        const tx = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: { user, pass },
          connectionTimeout: 10000,
          greetingTimeout: 8000,
          socketTimeout: 15000,
        });
        await tx.verify().catch(() => undefined);
        await tx.sendMail({ from, to: email, subject, text, html });
        return json(200, { ok: true, sent: true, vendor, email, accountId: finalAccountId, url, smtp: cfg });
      } catch (e: any) {
        lastErr = e;
        console.warn('[EMAIL_ONBOARD_LINK] SMTP send failed', cfg, e?.message || e);
      }
    }
    console.error('[EMAIL_ONBOARD_LINK] All SMTP attempts failed', lastErr?.message || lastErr);
    return json(500, { ok: false, error: lastErr?.message || 'email send failed', url });
  } catch (err: any) {
    console.error('[EMAIL_ONBOARD_LINK] Error:', err?.message || err);
    return json(500, { ok: false, error: err?.message || 'unknown error' });
  }
}


