import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import Mailjet from 'node-mailjet';
import sgMail from '@sendgrid/mail';
import { loadMap, findVendorKey, setVendorStatus } from '@/lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
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

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Send vendor onboarding email for QuickBooks payments
 * 
 * Since we now use QBO Bill Pay instead of Stripe:
 * - Vendors receive payments through the QuickBooks Business Network
 * - When their first payment is sent, QBO invites them to add their bank details
 * - This endpoint sends an informational email explaining the process
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vendor: string = (body.vendor || '').trim();
    const email: string = (body.email || '').trim();

    if (!vendor) return json(400, { ok: false, error: 'vendor required' });
    if (!isValidEmail(email)) return json(400, { ok: false, error: 'valid email required' });

    // Update vendor status to pending (email sent)
    const map = await loadMap();
    let key = findVendorKey(map, vendor) || vendor;
    if (!map.vendors[key]) {
      await setVendorStatus(key, { ach_status: 'pending' });
    } else {
      await setVendorStatus(key, { ...map.vendors[key], ach_status: 'pending' });
    }

    const companyName = process.env.COMPANY_NAME || 'Pacific Crest Smiles';
    const fromEmail = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || 'no-reply@pcsmilesai.com';
    const fromName = process.env.PCS_FROM_NAME || 'PCS AI';

    const subject = `Payment Setup Information - ${companyName}`;
    
    const htmlBody = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Payment Information for ${escapeHtml(vendor)}</h2>
        
        <p>Hello,</p>
        
        <p>This email is to inform you about receiving payments from <strong>${escapeHtml(companyName)}</strong>.</p>
        
        <div style="background: #f0f9ff; border: 1px solid #0284c7; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="color: #0284c7; margin-top: 0;">How You'll Receive Payments</h3>
          <p style="margin-bottom: 0;">We process all vendor payments through <strong>QuickBooks Bill Pay</strong>. When we send your first payment:</p>
          <ol style="margin-top: 8px;">
            <li>You'll receive an email invitation from QuickBooks</li>
            <li>Click the link to join the <strong>QuickBooks Business Network</strong></li>
            <li>Add your bank account details securely to your profile</li>
            <li>All future payments will be deposited directly to your account</li>
          </ol>
        </div>
        
        <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0;">What is the QuickBooks Business Network?</h4>
          <p style="margin-bottom: 0;">It's a secure platform where you can manage your payment preferences. Once you add your bank details, they're saved for all businesses that pay you through QuickBooks - making future payments fast and automatic.</p>
        </div>
        
        <p>If you have any questions about payments or invoicing, please contact us directly.</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Best regards,<br/>
          ${escapeHtml(companyName)} Accounts Payable
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        
        <p style="color: #9ca3af; font-size: 12px;">
          This is an automated message from PCS AI. If you did not expect this email, please disregard it.
        </p>
      </div>
    `;

    const textBody = `
Payment Information for ${vendor}

Hello,

This email is to inform you about receiving payments from ${companyName}.

HOW YOU'LL RECEIVE PAYMENTS
We process all vendor payments through QuickBooks Bill Pay. When we send your first payment:
1. You'll receive an email invitation from QuickBooks
2. Click the link to join the QuickBooks Business Network
3. Add your bank account details securely to your profile
4. All future payments will be deposited directly to your account

WHAT IS THE QUICKBOOKS BUSINESS NETWORK?
It's a secure platform where you can manage your payment preferences. Once you add your bank details, they're saved for all businesses that pay you through QuickBooks - making future payments fast and automatic.

If you have any questions about payments or invoicing, please contact us directly.

Best regards,
${companyName} Accounts Payable

---
This is an automated message from PCS AI.
    `;

    // Try SendGrid first
    const sgKey = process.env.SENDGRID_API_KEY || '';
    if (sgKey) {
      try {
        sgMail.setApiKey(sgKey);
        await sgMail.send({
          to: email,
          from: { email: fromEmail, name: fromName },
          subject,
          text: textBody,
          html: htmlBody,
        });
        console.log('[VENDOR_ONBOARD] Email sent via SendGrid', { vendor, email });
        return json(200, { ok: true, sent: true, vendor, email, provider: 'sendgrid' });
      } catch (e: any) {
        console.warn('[VENDOR_ONBOARD] SendGrid failed', e?.message);
      }
    }

    // Try Mailjet
    const mjKey = process.env.MAILJET_API_KEY || '';
    const mjSecret = process.env.MAILJET_API_SECRET || '';
    if (mjKey && mjSecret) {
      try {
        const mj = Mailjet.apiConnect(mjKey, mjSecret);
        await mj.post('send', { version: 'v3.1' }).request({
          Messages: [{
            From: { Email: fromEmail, Name: fromName },
            To: [{ Email: email }],
            Subject: subject,
            TextPart: textBody,
            HTMLPart: htmlBody,
          }],
        });
        console.log('[VENDOR_ONBOARD] Email sent via Mailjet', { vendor, email });
        return json(200, { ok: true, sent: true, vendor, email, provider: 'mailjet' });
      } catch (e: any) {
        console.warn('[VENDOR_ONBOARD] Mailjet failed', e?.message);
      }
    }

    // Try SMTP
    const smtpHost = process.env.SMTP_HOST || '';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `${fromName} <${fromEmail}>`,
          to: email,
          subject,
          text: textBody,
          html: htmlBody,
        });

        console.log('[VENDOR_ONBOARD] Email sent via SMTP', { vendor, email });
        return json(200, { ok: true, sent: true, vendor, email, provider: 'smtp' });
      } catch (e: any) {
        console.warn('[VENDOR_ONBOARD] SMTP failed', e?.message);
      }
    }

    // No email provider configured - return instructions
    console.warn('[VENDOR_ONBOARD] No email provider configured');
    return json(200, {
      ok: true,
      sent: false,
      vendor,
      email,
      message: 'No email provider configured. Please inform vendor manually about QuickBooks Business Network.',
    });
  } catch (err: any) {
    console.error('[VENDOR_ONBOARD] Error:', err?.message || err);
    return json(500, { ok: false, error: 'Failed to send onboarding email' });
  }
}
