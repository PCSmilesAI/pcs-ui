'use server';

import sgMail from '@sendgrid/mail';
import Mailjet from 'node-mailjet';
import nodemailer from 'nodemailer';

export interface RemittanceInvoice {
  invoiceNumber: string;
  amount: number;
  dueDate: string;
}

export interface RemittanceData {
  vendorName: string;
  vendorEmail: string;
  totalAmount: number;
  paymentDate: string;
  invoices: RemittanceInvoice[];
  transferId: string;
  companyName?: string;
}

/**
 * Generate a PDF remittance receipt using Puppeteer
 * This function is only called from server-side API routes
 */
export async function generateRemittancePDF(data: RemittanceData): Promise<Buffer> {
  const html = generateRemittanceHTML(data);

  let browser: any;
  try {
    // Dynamically require puppeteer to avoid bundling issues with Next.js
    // eslint-disable-next-line global-require
    const puppeteer = require('puppeteer');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.createPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'letter',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    await page.close();
    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate HTML for remittance receipt
 */
function generateRemittanceHTML(data: RemittanceData): string {
  const invoiceRows = data.invoices
    .map(
      (inv) =>
        `<tr>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${inv.invoiceNumber}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">$${inv.amount.toFixed(2)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${inv.dueDate}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">✓ Paid</td>
    </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #333;
          line-height: 1.6;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          text-align: center;
          color: #333;
          margin-bottom: 5px;
        }
        .company-name {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
          font-size: 12px;
        }
        .section {
          margin-bottom: 20px;
        }
        .section-title {
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 10px;
          border-bottom: 2px solid #333;
          padding-bottom: 5px;
        }
        .info-box {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .info-row {
          margin: 5px 0;
        }
        .info-label {
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #f0f0f0;
          padding: 10px;
          text-align: left;
          border-bottom: 2px solid #ddd;
          font-weight: bold;
        }
        td {
          padding: 10px;
          border-bottom: 1px solid #ddd;
        }
        .amount-col {
          text-align: right;
        }
        .status-col {
          text-align: center;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 11px;
          color: #666;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Remittance</h1>
        <div class="company-name">${data.companyName || 'Pacific Crest Smiles'}</div>

        <div class="section">
          <div class="section-title">Vendor Information</div>
          <div class="info-row"><span class="info-label">Vendor:</span> ${data.vendorName}</div>
          <div class="info-row"><span class="info-label">Email:</span> ${data.vendorEmail}</div>
        </div>

        <div class="section">
          <div class="section-title">Payment Summary</div>
          <div class="info-box">
            <div class="info-row"><span class="info-label">Payment Date:</span> ${data.paymentDate}</div>
            <div class="info-row"><span class="info-label">Transfer ID:</span> ${data.transferId}</div>
            <div class="info-row"><span class="info-label">Total Amount Paid:</span> <strong>$${data.totalAmount.toFixed(2)}</strong></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Invoices Paid</div>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th class="amount-col">Amount</th>
                <th>Due Date</th>
                <th class="status-col">Status</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <p>This is an automated remittance receipt. Please retain for your records.</p>
          <p>If you have any questions, please contact us.</p>
          <p>Generated: ${new Date().toISOString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send remittance email via SendGrid, Mailjet, or SMTP
 */
export async function sendRemittanceEmail(
  data: RemittanceData,
  pdfBuffer: Buffer
): Promise<{ ok: boolean; provider?: string; error?: string }> {
  const fromEmail = process.env.PCS_FROM_EMAIL || process.env.EMAIL_FROM || 'no-reply@pcsmilesai.com';
  const fromName = process.env.PCS_FROM_NAME || 'PCS AI';

  const subject = `Payment Remittance - ${data.vendorName}`;
  const htmlBody = generateEmailHTML(data);
  const textBody = generateEmailText(data);

  // Try SendGrid first
  const sgKey = process.env.SENDGRID_API_KEY || '';
  if (sgKey) {
    try {
      sgMail.setApiKey(sgKey);
      await sgMail.send({
        to: data.vendorEmail,
        from: { email: fromEmail, name: fromName },
        subject,
        text: textBody,
        html: htmlBody,
        attachments: [
          {
            content: pdfBuffer.toString('base64'),
            filename: `remittance-${data.transferId}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
      });
      console.log('[REMITTANCE][SendGrid] Email sent successfully', { vendor: data.vendorName });
      return { ok: true, provider: 'sendgrid' };
    } catch (e: any) {
      console.warn('[REMITTANCE][SendGrid] Failed', e?.message);
    }
  }

  // Try Mailjet
  const mjKey = process.env.MAILJET_API_KEY || '';
  const mjSecret = process.env.MAILJET_API_SECRET || '';
  if (mjKey && mjSecret) {
    try {
      const mj = Mailjet.apiConnect(mjKey, mjSecret);
      await mj.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: { Email: fromEmail, Name: fromName },
            To: [{ Email: data.vendorEmail }],
            Subject: subject,
            TextPart: textBody,
            HTMLPart: htmlBody,
            Attachments: [
              {
                ContentType: 'application/pdf',
                Filename: `remittance-${data.transferId}.pdf`,
                Base64Content: pdfBuffer.toString('base64'),
              },
            ],
          },
        ],
      });
      console.log('[REMITTANCE][Mailjet] Email sent successfully', { vendor: data.vendorName });
      return { ok: true, provider: 'mailjet' };
    } catch (e: any) {
      console.warn('[REMITTANCE][Mailjet] Failed', e?.message);
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
        to: data.vendorEmail,
        subject,
        text: textBody,
        html: htmlBody,
        attachments: [
          {
            filename: `remittance-${data.transferId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      console.log('[REMITTANCE][SMTP] Email sent successfully', { vendor: data.vendorName });
      return { ok: true, provider: 'smtp' };
    } catch (e: any) {
      console.warn('[REMITTANCE][SMTP] Failed', e?.message);
    }
  }

  return { ok: false, error: 'No email provider configured' };
}

function generateEmailHTML(data: RemittanceData): string {
  const invoiceRows = data.invoices
    .map(
      (inv) =>
        `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${inv.invoiceNumber}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${inv.amount.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${inv.dueDate}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">✓ Paid</td>
    </tr>`
    )
    .join('');

  return `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Payment Remittance</h2>
      <p style="color: #666;">Dear ${data.vendorName},</p>

      <p style="color: #666;">We have successfully processed payment for the invoices listed below.</p>

      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Total Amount Paid:</strong> $${data.totalAmount.toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Payment Date:</strong> ${data.paymentDate}</p>
        <p style="margin: 5px 0;"><strong>Transfer ID:</strong> ${data.transferId}</p>
      </div>

      <h3 style="color: #333; margin-top: 20px;">Invoices Paid</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Invoice #</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Due Date</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceRows}
        </tbody>
      </table>

      <p style="color: #666; margin-top: 20px; font-size: 12px;">
        This is an automated remittance receipt. Please retain for your records. If you have any questions, please contact us.
      </p>
    </div>
  `;
}

/**
 * Generate plain text email body
 */

function generateEmailText(data: RemittanceData): string {
  const invoiceLines = data.invoices
    .map((inv) => `  ${inv.invoiceNumber.padEnd(20)} $${inv.amount.toFixed(2).padEnd(12)} ${inv.dueDate}`)
    .join('\n');

  return `
Payment Remittance

Dear ${data.vendorName},

We have successfully processed payment for the invoices listed below.

PAYMENT SUMMARY
Total Amount Paid: $${data.totalAmount.toFixed(2)}
Payment Date: ${data.paymentDate}
Transfer ID: ${data.transferId}

INVOICES PAID
Invoice #            Amount       Due Date
${invoiceLines}

This is an automated remittance receipt. Please retain for your records.
If you have any questions, please contact us.

Generated: ${new Date().toISOString()}
  `;
}

