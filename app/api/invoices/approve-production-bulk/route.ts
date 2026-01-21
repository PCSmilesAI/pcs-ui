/**
 * Production Approval Flow - Bulk Approval Endpoint
 * 
 * POST /api/invoices/approve-production-bulk
 * 
 * Body:
 * {
 *   "action": "approve_ap" | "approve_om" | "approve_admin" | "mark_paid",
 *   "invoiceIds": ["id1", "id2", ...],
 *   "notes": "optional notes"
 * }
 * 
 * Each invoice is evaluated individually for threshold logic.
 * Only used when productionModeEnabled = true
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isProductionModeEnabled, getApprovalThreshold } from '@/lib/config/approvalFlow';
import {
  approveAsAP,
  approveAsOM,
  approveAsAdmin,
  markAsPaidByOM,
  validateApprovalPermission,
} from '@/lib/workflow/productionEngine';
import { readRoles } from '@/lib/workflow/rolesStore';
import { maybeAddToHistory } from '@/lib/gpt/historyAutoAdd';

// Helper to get roles config synchronously (cache result)
async function getRolesConfig() {
  const roles = await readRoles();
  return {
    admins: roles.admins,
    ap_authorizers: roles.ap_authorizers,
    office_managers: roles.office_managers,
    threshold_usd: roles.threshold_usd,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Check if production mode is enabled
    if (!isProductionModeEnabled()) {
      return NextResponse.json(
        { error: 'Production approval flow is not enabled' },
        { status: 400 }
      );
    }

    const user = getCurrentUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, invoiceIds, notes } = body;

    if (!action || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: action, invoiceIds (array)' },
        { status: 400 }
      );
    }

    // Validate action
    const validActions = ['approve_ap', 'approve_om', 'approve_admin', 'mark_paid'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Get database and roles
    const db = getDatabase();
    const roles = await getRolesConfig();

    // Process each invoice
    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const invoiceId of invoiceIds) {
      try {
        // Fetch invoice
        const invoice = db
          .prepare('SELECT * FROM invoices WHERE id = ?')
          .get(invoiceId) as any;

        if (!invoice) {
          results.failed.push({ id: invoiceId, error: 'Invoice not found' });
          continue;
        }

        // Parse approvals JSON if it exists
        if (invoice.approvals && typeof invoice.approvals === 'string') {
          invoice.approvals = JSON.parse(invoice.approvals);
        }

        // Validate permission
        const hasPermission = validateApprovalPermission(
          action as any,
          { email: user.email, name: user.name },
          invoice,
          { roles }
        );

        if (!hasPermission) {
          results.failed.push({
            id: invoiceId,
            error: 'You do not have permission to perform this action',
          });
          continue;
        }

        // Perform the action
        switch (action) {
          case 'approve_ap':
            approveAsAP(invoice, { email: user.email, name: user.name }, { roles });
            break;

          case 'approve_om':
            approveAsOM(invoice, { email: user.email, name: user.name }, { roles });
            break;

          case 'approve_admin':
            approveAsAdmin(invoice, { email: user.email, name: user.name });
            break;

          case 'mark_paid':
            markAsPaidByOM(invoice, { email: user.email, name: user.name });
            break;
        }

        // Log the action
        db.prepare(
          `INSERT INTO invoice_events (invoice_id, action, actor_email, actor_name, payload_json)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          invoiceId,
          `production_${action}_bulk`,
          user.email,
          user.name || '',
          JSON.stringify({ action, notes, approval_stage: invoice.approval_stage })
        );

        // Update invoice in database
        const updateStmt = db.prepare(`
          UPDATE invoices SET
            ap_approved_at = ?,
            ap_approved_by = ?,
            om_approved_at = ?,
            om_approved_by = ?,
            admin_approved_at = ?,
            admin_approved_by = ?,
            approval_stage = ?,
            approval_threshold_cents = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        updateStmt.run(
          invoice.ap_approved_at || null,
          invoice.ap_approved_by || null,
          invoice.om_approved_at || null,
          invoice.om_approved_by || null,
          invoice.admin_approved_at || null,
          invoice.admin_approved_by || null,
          invoice.approval_stage || null,
          invoice.approval_threshold_cents || null,
          invoiceId
        );

        // Auto-add to vendor history for AI training if status is confirmed
        if (invoice.status === 'to_be_paid' || invoice.status === 'paid') {
          maybeAddToHistory(invoice).then(result => {
            if (result.added) {
              console.log('[API][BULK]', 'added_to_history', { invoiceId });
            }
          }).catch(err => {
            console.warn('[API][BULK]', 'history_add_failed', { invoiceId, error: String(err) });
          });
        }

        results.successful.push(invoiceId);
      } catch (error: any) {
        console.error(`[API] Bulk approval error for invoice ${invoiceId}:`, error);
        results.failed.push({
          id: invoiceId,
          error: error.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk ${action} completed`,
      results,
      summary: {
        total: invoiceIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      },
    });
  } catch (error: any) {
    console.error('[API] Bulk production approval error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk approval', details: error.message },
      { status: 500 }
    );
  }
}

