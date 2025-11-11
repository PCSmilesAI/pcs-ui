import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '@/lib/db/client';

/**
 * Reconciliation endpoint to verify all emails have corresponding invoices
 * GET /api/inbox/reconcile - Returns reconciliation report
 */
export async function GET(req: NextRequest) {
  try {
    const db = getDatabase();
    
    // Get email tracking data
    const emailTrackingPath = path.join(process.cwd(), 'email_tracking.json');
    let emailTracking: Record<string, any> = {};
    
    if (fs.existsSync(emailTrackingPath)) {
      const data = fs.readFileSync(emailTrackingPath, 'utf-8');
      emailTracking = JSON.parse(data);
    }
    
    // Get all invoices from database
    const invoices = db.prepare(`
      SELECT 
        id,
        invoice_number,
        source_message_id,
        vendor_name,
        status,
        created_at
      FROM invoices
      WHERE deleted = 0
      ORDER BY created_at DESC
    `).all() as any[];
    
    // Build a map of source_message_id to invoices
    const invoicesByMessageId: Record<string, any[]> = {};
    invoices.forEach(inv => {
      if (inv.source_message_id) {
        if (!invoicesByMessageId[inv.source_message_id]) {
          invoicesByMessageId[inv.source_message_id] = [];
        }
        invoicesByMessageId[inv.source_message_id].push(inv);
      }
    });
    
    // Analyze reconciliation
    const report = {
      timestamp: new Date().toISOString(),
      totalEmails: Object.keys(emailTracking).length,
      totalInvoices: invoices.length,
      reconciliation: {
        processed: 0,
        failed: 0,
        noAttachments: 0,
        missing: 0,
      },
      details: {
        processed: [] as any[],
        failed: [] as any[],
        noAttachments: [] as any[],
        missing: [] as any[],
      },
    };
    
    // Check each email
    Object.entries(emailTracking).forEach(([messageId, emailData]: [string, any]) => {
      const invoicesForEmail = invoicesByMessageId[messageId] || [];
      
      if (emailData.status === 'processed') {
        report.reconciliation.processed++;
        if (invoicesForEmail.length === 0) {
          report.reconciliation.missing++;
          report.details.missing.push({
            messageId,
            subject: emailData.details?.subject,
            expectedCount: emailData.details?.success_count || 1,
            actualCount: 0,
            timestamp: emailData.timestamp,
          });
        } else {
          report.details.processed.push({
            messageId,
            subject: emailData.details?.subject,
            invoiceCount: invoicesForEmail.length,
            invoices: invoicesForEmail.map(inv => ({
              id: inv.id,
              number: inv.invoice_number,
              vendor: inv.vendor_name,
              status: inv.status,
            })),
            timestamp: emailData.timestamp,
          });
        }
      } else if (emailData.status === 'failed') {
        report.reconciliation.failed++;
        report.details.failed.push({
          messageId,
          subject: emailData.details?.subject,
          failureCount: emailData.details?.failure_count || 0,
          successCount: emailData.details?.success_count || 0,
          timestamp: emailData.timestamp,
        });
      } else if (emailData.status === 'no_attachments') {
        report.reconciliation.noAttachments++;
        report.details.noAttachments.push({
          messageId,
          subject: emailData.details?.subject,
          timestamp: emailData.timestamp,
        });
      }
    });
    
    // Calculate health score
    const healthScore = report.totalEmails > 0
      ? ((report.reconciliation.processed - report.reconciliation.missing) / report.totalEmails) * 100
      : 100;
    
    return NextResponse.json({
      ok: true,
      report: {
        ...report,
        healthScore: Math.round(healthScore * 100) / 100,
        status: healthScore === 100 ? 'healthy' : healthScore >= 95 ? 'warning' : 'critical',
      },
    });
  } catch (err: any) {
    console.error('[API][INBOX][RECONCILE]', 'error', { error: err?.message });
    return NextResponse.json(
      { error: err?.message || 'Reconciliation failed' },
      { status: 500 }
    );
  }
}

