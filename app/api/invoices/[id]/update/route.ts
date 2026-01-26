import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { applyCorrections } from '../../../../../lib/invoices/write';
import { logRepair } from '../../../../../lib/invoices/repairLogging';
import { rateLimitByUser } from '../../../../../lib/ratelimit/rateLimiter';
import { isValidInvoiceId } from '../../../../../lib/security/type-validation';
import { isAdmin, isAP } from '../../../../../lib/workflow/rolesStore';
import { detectReclassificationIntent, moveInvoiceToOtherDocuments, getDocumentTypeDisplayName } from '../../../../../lib/gpt/reclassifyIntent';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    console.warn('[API][INVOICES][UPDATE]', 'invalid_invoice_id', { invoiceId, userEmail: user.email });
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  // SECURITY: Only admins and AP managers can update invoices
  const [isAdminUser, isAPUser] = await Promise.all([
    isAdmin(user.email),
    isAP(user.email)
  ]);
  
  if (!isAdminUser && !isAPUser) {
    console.warn('[API][INVOICES][UPDATE]', 'unauthorized', { userEmail: user.email, invoiceId });
    return NextResponse.json({ error: 'Unauthorized - only admins and AP managers can update invoices' }, { status: 403 });
  }

  // Apply rate limiting per user (500 update requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 500, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][INVOICES][UPDATE]', 'rate_limit_exceeded', { userEmail: user.email, invoiceId });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '500',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  try {
    const db = getDatabase();

    // Fetch the original invoice before any changes
    // Try to find by id first, then by invoice_number
    let originalInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!originalInvoice) {
      // Fallback: try to find by invoice_number
      originalInvoice = db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
    }
    if (!originalInvoice) {
      console.warn('[API][INVOICES][UPDATE]', 'invoice_not_found', { invoiceId, userEmail: user.email });
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Use the actual database ID for all subsequent operations
    const actualInvoiceId = originalInvoice.id;

    const body = await req.json();
    const { vendor_name, office_id, amount_cents, invoice_number, invoice_date, due_date, overrideLocks, userComment } = body;

    // Check for reclassification intent in user comment
    // This allows users to say things like "this is a receipt, not an invoice"
    if (userComment && typeof userComment === 'string' && userComment.trim().length > 0) {
      try {
        const intent = await detectReclassificationIntent(userComment);
        
        if (intent.shouldReclassify && intent.newDocumentType && intent.confidence >= 0.7) {
          console.log('[API][INVOICES][UPDATE]', 'reclassification_detected', {
            invoiceId: actualInvoiceId,
            newDocumentType: intent.newDocumentType,
            confidence: intent.confidence,
            reason: intent.reason
          });
          
          // Move the document to other_documents
          const moveResult = await moveInvoiceToOtherDocuments(
            actualInvoiceId,
            intent.newDocumentType,
            user.email,
            userComment
          );
          
          if (moveResult.success) {
            console.log('[API][INVOICES][UPDATE]', 'reclassification_success', {
              originalInvoiceId: actualInvoiceId,
              newDocumentId: moveResult.newId,
              documentType: intent.newDocumentType
            });
            
            return NextResponse.json({
              ok: true,
              reclassified: true,
              newDocumentType: intent.newDocumentType,
              newDocumentTypeDisplay: getDocumentTypeDisplayName(intent.newDocumentType),
              newDocumentId: moveResult.newId,
              message: `Document moved to Other Documents as ${getDocumentTypeDisplayName(intent.newDocumentType)}`
            });
          } else {
            console.warn('[API][INVOICES][UPDATE]', 'reclassification_move_failed', {
              invoiceId: actualInvoiceId,
              error: moveResult.error
            });
            // Fall through to normal update if move fails
          }
        }
      } catch (reclassifyError: any) {
        console.warn('[API][INVOICES][UPDATE]', 'reclassification_check_error', {
          invoiceId: actualInvoiceId,
          error: reclassifyError?.message
        });
        // Fall through to normal update if reclassification check fails
      }
    }

    // Validate types
    if (vendor_name !== undefined && typeof vendor_name !== 'string') {
      return NextResponse.json({ error: 'vendor_name must be a string' }, { status: 400 });
    }
    if (office_id !== undefined && typeof office_id !== 'string') {
      return NextResponse.json({ error: 'office_id must be a string' }, { status: 400 });
    }
    if (amount_cents !== undefined && typeof amount_cents !== 'number') {
      return NextResponse.json({ error: 'amount_cents must be a number' }, { status: 400 });
    }
    if (invoice_number !== undefined && typeof invoice_number !== 'string') {
      return NextResponse.json({ error: 'invoice_number must be a string' }, { status: 400 });
    }
    if (invoice_date !== undefined && typeof invoice_date !== 'string') {
      return NextResponse.json({ error: 'invoice_date must be a string' }, { status: 400 });
    }
    if (due_date !== undefined && typeof due_date !== 'string') {
      return NextResponse.json({ error: 'due_date must be a string' }, { status: 400 });
    }

    // Build patch for correction fields (vendor, office, amount)
    const patch: Record<string, any> = {};
    if (vendor_name !== undefined) patch.vendor_name = vendor_name;
    if (office_id !== undefined) patch.office_id = office_id;
    if (amount_cents !== undefined) patch.amount_cents = amount_cents;

    // Build direct update fields (invoice_number, dates)
    const directUpdates: Record<string, any> = {};
    if (invoice_number !== undefined) directUpdates.invoice_number = invoice_number;
    if (invoice_date !== undefined) directUpdates.invoice_date = invoice_date;
    if (due_date !== undefined) directUpdates.due_date = due_date;

    if (Object.keys(patch).length === 0 && Object.keys(directUpdates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Apply corrections to database for vendor/office/amount (use actual database ID)
    if (Object.keys(patch).length > 0) {
      await applyCorrections(actualInvoiceId, user.email, patch, overrideLocks === true);
    }

    // Apply direct updates for invoice_number, dates, and coded tracking
    const now = new Date().toISOString();
    const directUpdateFields = [
      ...Object.keys(directUpdates).map(k => `${k} = ?`),
      'coded_at = ?',
      'coded_by_user_id = ?',
      'updated_at = CURRENT_TIMESTAMP'
    ].join(', ');
    const directUpdateValues = [
      ...Object.values(directUpdates),
      now,
      user.email
    ];
    
    db.prepare(`UPDATE invoices SET ${directUpdateFields} WHERE id = ?`)
      .run(...directUpdateValues, actualInvoiceId);
    
    // Log the direct updates as an event
    if (Object.keys(directUpdates).length > 0) {
      db.prepare(`
        INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
        VALUES (?, 'DIRECT_UPDATE', ?, ?)
      `).run(actualInvoiceId, user.email, JSON.stringify(directUpdates));
    }

    // If amount was changed, reset all category AMOUNTS to $0 (but preserve class assignments)
    if (amount_cents !== undefined) {
      // Check if there are any existing GL Lines
      const existingLines = db.prepare(`
        SELECT COUNT(*) as count FROM invoice_categories WHERE invoice_id = ?
      `).get(actualInvoiceId) as { count: number };
      
      if (existingLines.count > 0) {
        // Only reset amounts, preserve class_id and class_name
        const resetResult = db.prepare(`
          UPDATE invoice_categories 
          SET amount_cents = 0 
          WHERE invoice_id = ?
        `).run(actualInvoiceId);

        // Log the allocation reset
        db.prepare(`
          INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
          VALUES (?, 'ALLOCATIONS_RESET', ?, ?)
        `).run(
          actualInvoiceId,
          user.email,
          JSON.stringify({
            reason: 'Invoice amount changed',
            new_amount_cents: amount_cents,
            categories_reset: resetResult.changes
          })
        );

        console.log('[API][INVOICES][UPDATE]', 'allocations_reset', {
          invoiceId: actualInvoiceId,
          categoriesReset: resetResult.changes,
          newAmountCents: amount_cents
        });
      }
    }

    // Fetch updated invoice (use actual database ID)
    const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(actualInvoiceId) as any;
    if (!updatedInvoice) {
      return NextResponse.json({ error: 'Invoice not found after update' }, { status: 404 });
    }

    // Log the repair for AI training (includes amount change for LLM re-analysis)
    try {
      await logRepair(
        originalInvoice.invoice_number,
        originalInvoice.vendor_name || originalInvoice.parsed_vendor_name || 'Unknown',
        user.email,
        {
          invoice_number: originalInvoice.invoice_number,
          vendor_name: originalInvoice.vendor_name,
          office_id: originalInvoice.office_id,
          amount_cents: originalInvoice.amount_cents,
          parsed_vendor_name: originalInvoice.parsed_vendor_name,
          parsed_office_id: originalInvoice.parsed_office_id,
          parsed_amount_cents: originalInvoice.parsed_amount_cents,
        },
        {
          invoice_number: updatedInvoice.invoice_number,
          vendor_name: updatedInvoice.vendor_name,
          office_id: updatedInvoice.office_id,
          amount_cents: updatedInvoice.amount_cents,
          parsed_vendor_name: updatedInvoice.parsed_vendor_name,
          parsed_office_id: updatedInvoice.parsed_office_id,
          parsed_amount_cents: updatedInvoice.parsed_amount_cents,
          // Include allocation reset info for LLM training
          allocations_were_reset: amount_cents !== undefined,
          update_type: amount_cents !== undefined ? 'amount_correction' : 'field_correction',
        },
        originalInvoice.pdf_path
      );
      
      // If amount was changed, log this specifically for LLM training
      if (amount_cents !== undefined) {
        console.log('[API][INVOICES][UPDATE]', 'amount_change_logged_for_llm', {
          invoiceId: actualInvoiceId,
          oldAmount: originalInvoice.amount_cents,
          newAmount: amount_cents,
          difference: amount_cents - (originalInvoice.amount_cents || 0)
        });
      }

      // Trigger PCS AI knowledge base training with the correction
      // This updates the vendor's parsing prompt to improve future accuracy
      const vendorName = updatedInvoice.vendor_name || originalInvoice.vendor_name || originalInvoice.parsed_vendor_name;
      if (vendorName && originalInvoice.pdf_path) {
        console.log('[API][INVOICES][UPDATE]', 'triggering_pcs_ai_training', { vendorName, invoiceId: actualInvoiceId });
        
        // Build original parsed data from the invoice
        const originalParsed = {
          invoice_number: originalInvoice.invoice_number,
          vendor_name: originalInvoice.vendor_name || originalInvoice.parsed_vendor_name,
          office_location: originalInvoice.office_id || originalInvoice.parsed_office_id,
          total: originalInvoice.amount_cents ? originalInvoice.amount_cents / 100 : null,
          invoice_date: originalInvoice.invoice_date,
          due_date: originalInvoice.due_date,
        };

        // Build corrected data from the patch
        const correctedData: Record<string, any> = {
          invoice_number: updatedInvoice.invoice_number,
          vendor_name: updatedInvoice.vendor_name,
          office_location: updatedInvoice.office_id,
          total: updatedInvoice.amount_cents ? updatedInvoice.amount_cents / 100 : null,
          invoice_date: updatedInvoice.invoice_date,
          due_date: updatedInvoice.due_date,
        };

        // Include user comment if provided (heavily weighted in training)
        if (body.userComment) {
          correctedData._user_comment = body.userComment;
        }

        // Fire-and-forget the training request (don't block the response)
        const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'http://localhost:3000';
        
        fetch(`${baseUrl}/api/gpt-train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorName,
            pdfPath: originalInvoice.pdf_path,
            originalParsed,
            correctedData,
          })
        }).then(async (trainRes) => {
          if (trainRes.ok) {
            const trainResult = await trainRes.json();
            console.log('[API][INVOICES][UPDATE]', 'pcs_ai_training_success', { 
              vendorName, 
              version: trainResult.version,
              invoiceId: actualInvoiceId 
            });
          } else {
            const errorText = await trainRes.text();
            console.warn('[API][INVOICES][UPDATE]', 'pcs_ai_training_failed', { 
              vendorName, 
              status: trainRes.status,
              error: errorText,
              invoiceId: actualInvoiceId 
            });
          }
        }).catch((trainErr) => {
          console.warn('[API][INVOICES][UPDATE]', 'pcs_ai_training_error', { 
            vendorName, 
            error: trainErr.message,
            invoiceId: actualInvoiceId 
          });
        });
      }
    } catch (logError) {
      console.error('[API][INVOICES][UPDATE]', 'Failed to log repair', { invoiceId: actualInvoiceId, error: (logError as any)?.message });
      // Don't fail the update if logging fails, just log the error
    }

    console.log('[API][INVOICES][UPDATE]', 'success', { invoiceId: actualInvoiceId, requestedId: invoiceId, userEmail: user.email });
    return NextResponse.json({ 
      ok: true, 
      invoice: updatedInvoice,
      allocations_reset: amount_cents !== undefined
    });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[API][INVOICES][UPDATE]', 'error', { invoiceId, error: err?.message });

    if (err?.message?.includes('locked')) {
      // Return safe error message to client
      return NextResponse.json({ error: 'Invoice is locked' }, { status: 409 });
    }

    // Return safe error message to client
    return NextResponse.json({ error: 'Update failed' }, { status: 400 });
  }
}

