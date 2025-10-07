import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
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

    const host = process.env.SMTP_HOST || '';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const from = process.env.PCS_FROM_EMAIL || 'no-reply@pcsmilesai.com';

    if (!host || !user || !pass) {
      console.error('[EMAIL_ONBOARD_LINK] Missing SMTP env; returning link for manual sending');
      return json(200, { ok: true, sent: false, vendor, email, accountId: finalAccountId, url });
    }

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

    const subject = `ACH Onboarding for ${vendor}`;
    const text = `Hello,

Please complete ACH onboarding for ${vendor} using the secure link below:

${url}

This link is provided by PCS AI via Stripe. If you did not expect this email, please contact support.`;

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <p>Hello,</p>
        <p>Please complete ACH onboarding for <strong>${vendor}</strong> using the secure link below:</p>
        <p><a href="${url}" target="_blank" rel="noopener noreferrer">Complete ACH Onboarding</a></p>
        <p style="color:#6b7280;font-size:12px;">This link is provided by PCS AI via Stripe.</p>
      </div>
    `;

    await transporter.sendMail({ from, to: email, subject, text, html });

    return json(200, { ok: true, sent: true, vendor, email, accountId: finalAccountId, url });
  } catch (err: any) {
    console.error('[EMAIL_ONBOARD_LINK] Error:', err?.message || err);
    return json(500, { ok: false, error: err?.message || 'unknown error' });
  }
}


