import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { isAP } from '../../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../../lib/db/client';
import { validateCSRFToken } from '../../../../../lib/middleware/csrf';
import { isValidInvoiceId } from '../../../../../lib/security/type-validation';

export const dynamic = 'force-dynamic';

const MECHANIC_BASE_URL = process.env.MECHANIC_BASE_URL || 'http://100.82.172.44:8001';

// Map vendor names to their parser files
function deriveCandidateFiles(vendor: string): string[] {
  const vendorLower = vendor?.toLowerCase() || '';
  
  if (vendorLower.includes('exodus')) {
    return ['exodus_parser.py', 'vendor_router.py', 'invoice_categorizer.py'];
  }
  if (vendorLower.includes('henry')) {
    return ['henry_parser.py', 'vendor_router.py', 'invoice_categorizer.py'];
  }
  if (vendorLower.includes('patterson')) {
    return ['patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py', 'vendor_router.py', 'invoice_categorizer.py'];
  }
  if (vendorLower.includes('tc dental') || vendorLower.includes('multipage')) {
    return ['multipage_invoice_processor.py', 'vendor_router.py', 'invoice_categorizer.py'];
  }
  
  // Default: general parser and common files
  return ['general_invoice_parser.py', 'enhanced_vendor_router.py', 'vendor_router.py', 'invoice_categorizer.py'];
}

// Infer parser name from vendor
function inferParserFromVendor(vendor: string): string {
  const vendorLower = vendor?.toLowerCase() || '';
  
  if (vendorLower.includes('exodus')) return 'exodus';
  if (vendorLower.includes('henry')) return 'henry';
  if (vendorLower.includes('patterson')) return 'patterson';
  if (vendorLower.includes('tc dental')) return 'tc_dental';
  
  return 'general';
}

/**
 * POST /api/invoices/[id]/report-parser-issue
 * Send invoice corrections to the AI mechanic to improve the parser.
 * 
 * Body: {
 *   corrected_fields: { vendor_name?: string, office_id?: string, amount_cents?: number, ... }
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // Only admins and AP managers can trigger parser improvements
  const isAuthorized = await isAP(user.email);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Only admins and AP managers can improve the parser' },
      { status: 403 }
    );
  }

  // CSRF protection
  const csrfValid = validateCSRFToken(req);
  if (!csrfValid) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  // Validate invoice ID
  if (!isValidInvoiceId(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { corrected_fields, user_comment, original_fields: clientOriginalFields, changed_fields } = body;

    if (!corrected_fields || typeof corrected_fields !== 'object') {
      return NextResponse.json(
        { error: 'corrected_fields is required and must be an object' },
        { status: 400 }
      );
    }

    // Fetch the invoice from the database
    // Try to find by id first, then by invoice_number
    const db = getDatabase();
    let invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      // Fallback: try to find by invoice_number
      invoice = db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
    }

    if (!invoice) {
      console.warn('[AI-MECHANIC][REPORT]', 'invoice_not_found', { invoiceId, userEmail: user.email });
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Use the actual database ID for logging
    const actualInvoiceId = invoice.id;

    // Build original parsed fields from the invoice
    const original_fields = {
      vendor_name: invoice.parsed_vendor_name || invoice.vendor_name,
      office_id: invoice.parsed_office_id || invoice.office_id,
      amount_cents: invoice.parsed_amount_cents || invoice.amount_cents,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
    };

    const vendor = corrected_fields.vendor_name || invoice.vendor_name || 'Unknown';
    const parser = inferParserFromVendor(vendor);
    const candidate_files = deriveCandidateFiles(vendor);

    // Build description with user comment if provided
    let description = `User corrected invoice #${invoiceId} from vendor ${vendor}. Parser ${parser} failed to match corrected fields.`;
    if (user_comment) {
      description += `\n\nUser Comment: ${user_comment}`;
    }
    if (changed_fields && changed_fields.length > 0) {
      description += `\n\nChanged Fields: ${changed_fields.join(', ')}`;
    }

    // Build the payload for the mechanic
    const payload = {
      error_type: user_comment ? 'user_feedback' : 'invoice_field_correction',
      description,
      invoice_id: actualInvoiceId,
      vendor,
      parser,
      candidate_files,
      original_fields,
      corrected_fields,
      user_comment: user_comment || null,
      changed_fields: changed_fields || [],
      user_email: user.email,
    };

    console.log('[AI-MECHANIC][REPORT]', 'sending', {
      invoiceId: actualInvoiceId,
      requestedId: invoiceId,
      vendor,
      parser,
      userEmail: user.email,
      hasComment: !!user_comment,
    });

    // Send to mechanic
    const response = await fetch(`${MECHANIC_BASE_URL}/auto_fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AI-MECHANIC][REPORT]', 'mechanic_error', { 
        status: response.status, 
        error: errorData 
      });
      return NextResponse.json(
        { error: errorData?.error || 'Mechanic failed to process correction' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[AI-MECHANIC][REPORT]', 'success', { 
      invoiceId, 
      runId: data?.run_id,
      branch: data?.branch_name,
      userEmail: user.email 
    });

    return NextResponse.json({
      ok: true,
      message: 'Parser improvement request sent to AI mechanic',
      run_id: data?.run_id,
      branch_name: data?.branch_name,
      status: data?.status,
    });

  } catch (error: any) {
    console.error('[AI-MECHANIC][REPORT]', 'error', { error: error?.message });
    
    if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'AI Mechanic server is not reachable' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to report parser issue' },
      { status: 500 }
    );
  }
}

