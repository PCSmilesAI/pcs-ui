import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { readRoles } from '../../../../../lib/workflow/rolesStore';
import { applyCodingTemplate, getInvoiceAllocations } from '../../../../../lib/invoices/coding-template-service';
import { getDatabase } from '../../../../../lib/db/client';
import { rateLimitByUser } from '../../../../../lib/ratelimit/rateLimiter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/{id}/apply-coding-template
 * 
 * Apply a coding template to an invoice.
 * Only Accounts Payable Managers can call this.
 * 
 * Request body:
 * {
 *   "template_id": "uuid"
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // Rate limiting (100 requests per 60 seconds)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 100, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  try {
    // Check authorization - only AP managers can apply coding templates
    const roles = await readRoles();
    const isAPManager = roles.ap_authorizers.some(
      (email: string) => email.toLowerCase() === user.email.toLowerCase()
    );
    const isAdmin = roles.admins.some(
      (email: string) => email.toLowerCase() === user.email.toLowerCase()
    );

    if (!isAPManager && !isAdmin) {
      console.log('[API][CODING_TEMPLATE]', 'unauthorized', {
        invoiceId,
        userEmail: user.email,
        isAdmin: user.isAdmin
      });
      return NextResponse.json(
        { error: 'Only Accounts Payable Managers can apply coding templates' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { template_id } = body;

    if (!template_id || typeof template_id !== 'string') {
      return NextResponse.json(
        { error: 'template_id is required and must be a string' },
        { status: 400 }
      );
    }

    // Get invoice to verify it exists and check status
    const db = getDatabase();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Check if already coded
    if (invoice.is_multi_location) {
      return NextResponse.json(
        { error: 'Invoice is already coded as multi-location' },
        { status: 400 }
      );
    }

    // Apply the coding template
    const result = applyCodingTemplate(invoiceId, template_id, user.email);

    if (!result.success) {
      console.log('[API][CODING_TEMPLATE]', 'apply_failed', {
        invoiceId,
        templateId: template_id,
        error: result.error
      });
      return NextResponse.json(
        { error: result.error || 'Failed to apply coding template' },
        { status: 400 }
      );
    }

    // Fetch updated invoice
    const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    const allocations = getInvoiceAllocations(invoiceId);

    console.log('[API][CODING_TEMPLATE]', 'applied_successfully', {
      invoiceId,
      templateId: template_id,
      numAllocations: allocations.length,
      userEmail: user.email
    });

    return NextResponse.json({
      ok: true,
      invoice: updatedInvoice,
      allocations
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATE]', 'error', {
      invoiceId,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

