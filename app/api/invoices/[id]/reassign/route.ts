import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/getCurrentUser';
import { reassignInvoice, getReassignmentTargets } from '../../../../lib/invoices/reassignmentService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/[id]/reassign
 * Returns available reassignment targets
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targets = await getReassignmentTargets();
    return NextResponse.json({
      ok: true,
      targets,
    });
  } catch (error: any) {
    console.error('[API][REASSIGN][GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get reassignment targets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoices/[id]/reassign
 * Reassign an invoice to another user
 * 
 * Body: { targetEmail: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(req);
    if (!user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invoiceId = params.id;
    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { targetEmail } = body;

    if (!targetEmail || typeof targetEmail !== 'string') {
      return NextResponse.json(
        { error: 'targetEmail is required' },
        { status: 400 }
      );
    }

    console.log('[API][REASSIGN]', {
      invoiceId,
      fromUser: user.email,
      toUser: targetEmail,
    });

    // Perform reassignment
    const updatedInvoice = await reassignInvoice(
      invoiceId,
      targetEmail,
      user.email
    );

    return NextResponse.json({
      ok: true,
      invoice: updatedInvoice,
      message: `Invoice reassigned successfully`,
    });
  } catch (error: any) {
    console.error('[API][REASSIGN][POST]', error);
    
    // Return appropriate error status
    if (error?.message?.includes('permission')) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    
    if (error?.message?.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to reassign invoice' },
      { status: 500 }
    );
  }
}

