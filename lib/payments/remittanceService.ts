import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
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
 * Generate a PDF remittance receipt
 */
export async function generateRemittancePDF(data: RemittanceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'letter',
      margin: 50,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Payment Remittance', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(data.companyName || 'PCS AI', { align: 'center' });
    doc.moveDown(1);

    // Vendor info
    doc.fontSize(12).font('Helvetica-Bold').text('Vendor Information');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Vendor: ${data.vendorName}`);
    doc.text(`Email: ${data.vendorEmail}`);
    doc.moveDown(1);

    // Payment summary
    doc.fontSize(12).font('Helvetica-Bold').text('Payment Summary');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Payment Date: ${data.paymentDate}`);
    doc.text(`Transfer ID: ${data.transferId}`);
    doc.text(`Total Amount Paid: $${data.totalAmount.toFixed(2)}`, { underline: true });
    doc.moveDown(1);

    // Invoice details table
    doc.fontSize(12).font('Helvetica-Bold').text('Invoices Paid');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 250;
    const col3 = 400;
    const col4 = 500;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Invoice #', col1, tableTop);
    doc.text('Amount', col2, tableTop);
    doc.text('Due Date', col3, tableTop);
    doc.text('Status', col4, tableTop);

    // Horizontal line
    doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Table rows
    doc.font('Helvetica').fontSize(9);
    let yPosition = tableTop + 25;

    for (const invoice of data.invoices) {
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      doc.text(invoice.invoiceNumber, col1, yPosition);
      doc.text(`$${invoice.amount.toFixed(2)}`, col2, yPosition);
      doc.text(invoice.dueDate, col3, yPosition);
      doc.text('Paid', col4, yPosition);

      yPosition += 20;
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    doc.text('This is an automated remittance receipt. Please retain for your records.', {
      align: 'center',
    });
    doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

    doc.end();
  });
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

