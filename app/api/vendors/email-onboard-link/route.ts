import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import Mailjet from 'node-mailjet';
import sgMail from '@sendgrid/mail';
import https from 'https';
import { loadMap, findVendorKey, setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      // CORS for browser callers when needed
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    },
  });
}

function isValidEmail(address: string | undefined | null) {
  if (!address) return false;
  return /.+@.+\..+/.test(address);
}

function maskEmail(address: string): string {
  try {
    const [local, domain] = String(address || '').split('@');
    if (!domain) return '***';
    if (!local) return `***@${domain}`;
    const first = local.substring(0, 1);
    return `${first}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
  } catch {
    return '***';
  }
}

async function sendViaProxyFetch(proxyUrl: string, payload: any, debugInfo: any) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    console.log('[EMAIL_ONBOARD_LINK][Proxy] START fetch', { url: proxyUrl });
    const resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    debugInfo.method = 'fetch';
    debugInfo.status = resp.status;
    debugInfo.snippet = text.slice(0, 180);
    if (!resp.ok) {
      console.warn('[EMAIL_ONBOARD_LINK][Proxy] Non-success response (fetch)', resp.status, debugInfo.snippet);
      return { ok: false };
    }
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    const ok = !!data?.ok;
    return { ok };
  } catch (e: any) {
    debugInfo.method = 'fetch';
    debugInfo.error = e?.name ? `${e.name}: ${e.message || e}` : (e?.message || String(e));
    console.warn('[EMAIL_ONBOARD_LINK][Proxy] Error (fetch)', debugInfo.error);
    return { ok: false };
  }
}

async function sendViaProxyHttps(proxyUrl: string, payload: any, debugInfo: any) {
  return await new Promise<{ ok: boolean }>((resolve) => {
    try {
      const urlObj = new URL(proxyUrl);
      const bodyStr = JSON.stringify(payload);
      const options: https.RequestOptions = {
        method: 'POST',
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + (urlObj.search || ''),
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(bodyStr),
        },
        timeout: 6000,
      };

      console.log('[EMAIL_ONBOARD_LINK][Proxy] START https', { host: options.hostname, path: options.path });
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          debugInfo.method = 'https';
          debugInfo.status = res.statusCode || 0;
          debugInfo.snippet = txt.slice(0, 180);
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            console.warn('[EMAIL_ONBOARD_LINK][Proxy] Non-success response (https)', res.statusCode, debugInfo.snippet);
            resolve({ ok: false });
            return;
          }
          let data: any = {};
          try { data = JSON.parse(txt); } catch {}
          const ok = !!data?.ok;
          resolve({ ok });
        });
      });
      req.on('timeout', () => {
        debugInfo.method = 'https';
        debugInfo.error = 'timeout';
        console.warn('[EMAIL_ONBOARD_LINK][Proxy] Error (https) timeout');
        req.destroy(new Error('timeout'));
        resolve({ ok: false });
      });
      req.on('error', (err) => {
        debugInfo.method = 'https';
        debugInfo.error = err?.message || String(err);
        console.warn('[EMAIL_ONBOARD_LINK][Proxy] Error (https)', debugInfo.error);
        resolve({ ok: false });
      });
      req.write(bodyStr);
      req.end();
    } catch (e: any) {
      debugInfo.method = 'https';
      debugInfo.error = e?.message || String(e);
      console.warn('[EMAIL_ONBOARD_LINK][Proxy] Error (https setup)', debugInfo.error);
      resolve({ ok: false });
    }
  });
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
    const refreshUrl = `${origin}/VendorOnboardingSuccess?vendor=${encodeURIComponent(vendorParam || '')}`;
    const returnUrl = `${origin}/VendorOnboardingSuccess?vendor=${encodeURIComponent(vendorParam || '')}`;
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
    const debugFlag = req.nextUrl?.searchParams?.get('debug') === 'true';
    const body = await req.json().catch(() => ({}));
    const vendor: string = (body.vendor || '').trim();
    const email: string = (body.email || '').trim();
    const accountId: string | undefined = (body.stripeAccountId || '').trim() || undefined;

    if (!vendor) return json(400, { ok: false, error: 'vendor required' });
    if (!isValidEmail(email)) return json(400, { ok: false, error: 'valid email required' });

    const { url, accountId: finalAccountId } = await ensureStripeAccountAndLink(req, vendor, accountId);

    // Prefer a server-side email proxy (Vercel) to bypass browser CORS and any SMTP egress limits
    const proxyUrlFromBody: string = (body.proxyUrl || body.emailProxyUrl || '').trim();
    const proxyUrl = (proxyUrlFromBody || process.env.EMAIL_PROXY_URL || process.env.NEXT_PUBLIC_EMAIL_PROXY_URL || '').trim();
    const debugInfo: any = { triedProxy: false };
    if (proxyUrl) {
      debugInfo.triedProxy = true;
      debugInfo.proxyUrlUsed = proxyUrl;
      const payload = { to: email, vendor, url };
      const maskedTo = maskEmail(email);
      console.log('[EMAIL_ONBOARD_LINK][Proxy] Attempt', { vendor, to: maskedTo, proxyUrl });
      let result = await sendViaProxyFetch(proxyUrl, payload, debugInfo);
      if (!result.ok) {
        // Retry via https
        result = await sendViaProxyHttps(proxyUrl, payload, debugInfo);
      }
      if (result.ok) {
        const resBody: any = { ok: true, sent: true, vendor, email, accountId: finalAccountId, url, delivery: debugInfo.method === 'https' ? 'https' : 'proxy', provider: 'proxy', proxyUrl };
        if (debugFlag) resBody.debug = { triedProxy: true, proxyUrlUsed: proxyUrl, method: debugInfo.method, status: debugInfo.status };
        return json(200, resBody);
      }
      console.warn('[EMAIL_ONBOARD_LINK][Proxy] Both attempts failed', { status: debugInfo.status, method: debugInfo.method, snippet: debugInfo.snippet });
      if (debugFlag) {
        // Return manual link with debug info
        return json(200, { ok: true, sent: false, vendor, email, accountId: finalAccountId, url, debug: { triedProxy: true, proxyUrlUsed: proxyUrl, method: debugInfo.method, status: debugInfo.status, snippet: debugInfo.snippet } });
      }
      // fall through to legacy SMTP/Mailjet flow
    }

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

    // Try SendGrid first (most reliable with firewall restrictions)
    const sgKey = process.env.SENDGRID_API_KEY || '';
    if (sgKey) {
      try {
        sgMail.setApiKey(sgKey);
        const fromEmail = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@pcsmilesai.com';
        const fromName = process.env.PCS_FROM_NAME || 'PCS AI';
        const maskedTo = maskEmail(email);
        console.log('[EMAIL_ONBOARD_LINK][SendGrid] Attempt', { vendor, to: maskedTo });

        await sgMail.send({
          to: email,
          from: { email: fromEmail, name: fromName },
          subject: `ACH Onboarding for ${vendor}`,
          text: `Hello,\n\nPlease complete ACH onboarding for ${vendor} using the secure link below:\n\n${url}\n\nThis link is provided by PCS AI via Stripe. If you did not expect this email, please contact support.`,
          html: `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
              <p>Hello,</p>
              <p>Please complete ACH onboarding for <strong>${vendor}</strong> using the secure link below:</p>
              <p><a href="${url}" target="_blank" rel="noopener noreferrer">Complete ACH Onboarding</a></p>
              <p style="color:#6b7280;font-size:12px;">This link is provided by PCS AI via Stripe.</p>
            </div>
          `,
        });

        console.log('[EMAIL_ONBOARD_LINK][SendGrid] Success', { vendor, to: maskedTo });
        return json(200, { ok: true, sent: true, vendor, email, accountId: finalAccountId, url, provider: 'sendgrid' });
      } catch (e: any) {
        console.warn('[EMAIL_ONBOARD_LINK][SendGrid] Failed', e?.message || e);
        // Fall through to Mailjet/SMTP
      }
    }

    const mjKey = process.env.MAILJET_API_KEY || '';
    const mjSecret = process.env.MAILJET_API_SECRET || '';

    // Try Mailjet HTTP API if keys provided (no SMTP ports required)
    if (mjKey && mjSecret) {
      const fromEmail = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@pcsmilesai.com';
      const fromName = process.env.PCS_FROM_NAME || 'PCS AI';

      async function tryMailjet(host: string): Promise<boolean> {
        try {
          const mj = Mailjet.apiConnect(mjKey, mjSecret, {
            config: { host },
            options: { timeout: 10000 },
          } as any);
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
          if (!ok) console.warn('[EMAIL_ONBOARD_LINK][Mailjet] Non-success response', body);
          return !!ok;
        } catch (e: any) {
          console.error('[EMAIL_ONBOARD_LINK][Mailjet] Error', host, e?.message || e);
          return false;
        }
      }

      const prefHost = (process.env.MAILJET_API_URL?.trim()) || ((process.env.MAILJET_REGION || '').toLowerCase() === 'eu' ? 'api.eu.mailjet.com' : 'api.mailjet.com');
      const hosts = Array.from(new Set([prefHost, 'api.mailjet.com', 'api.eu.mailjet.com']));

      for (let i = 0; i < hosts.length; i++) {
        const ok = await tryMailjet(hosts[i]);
        if (ok) return json(200, { ok: true, sent: true, vendor, email, accountId: finalAccountId, url, provider: 'mailjet', host: hosts[i] });
        // brief backoff before next attempt
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    const hasSmtpEnv = !!(host && user && pass);
    if (!hasSmtpEnv && !(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET)) {
      console.error('[EMAIL_ONBOARD_LINK] Missing SMTP and Mailjet creds; returning link for manual sending');
      return json(200, { ok: true, sent: false, vendor, email, accountId: finalAccountId, url });
    }

    const subject = baseSubject;
    const text = baseText;
    const html = baseHtml;

    // Try multiple SMTP configs (GoDaddy relay first, then primary, then Mailjet 2525)
    type Attempt = { host: string; port: number; secure: boolean; authUser?: string; authPass?: string; noAuth?: boolean };
    const attempts: Attempt[] = [];

    // GoDaddy relay server (no authentication required) - TRY FIRST
    attempts.push({ host: 'relay-hosting.secureserver.net', port: 25, secure: false, noAuth: true });

    // Then try configured SMTP settings
    if (hasSmtpEnv) {
      attempts.push(
        { host, port, secure, authUser: user, authPass: pass },
        { host: host || 'smtpout.secureserver.net', port: 465, secure: true, authUser: user, authPass: pass },
        { host: host || 'smtpout.secureserver.net', port: 587, secure: false, authUser: user, authPass: pass },
        { host: host || 'smtp.secureserver.net', port: 587, secure: false, authUser: user, authPass: pass },
      );
    }

    // Mailjet SMTP fallback on 2525 (open on this server)
    if (process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET) {
      attempts.push({ host: 'in-v3.mailjet.com', port: 2525, secure: false, authUser: process.env.MAILJET_API_KEY, authPass: process.env.MAILJET_API_SECRET });
    }
    let lastErr: any = null;
    for (const cfg of attempts) {
      try {
        if (!cfg.host) continue;
        const transportConfig: any = {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          connectionTimeout: 10000,
          greetingTimeout: 8000,
          socketTimeout: 15000,
        };
        // Only add auth if not explicitly marked as noAuth
        if (!cfg.noAuth) {
          transportConfig.auth = { user: cfg.authUser || user, pass: cfg.authPass || pass };
        }
        const tx = nodemailer.createTransport(transportConfig);
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


