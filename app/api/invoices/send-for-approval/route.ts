import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getInvoiceById, saveInvoice } from '../../../../lib/invoices/db-store';
import { createBillFromInvoice } from '../../../../lib/qbo/billCreationService';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';
import { getApprovalDestination, isVerifier } from '../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../lib/db/client';
import { readOffices } from '../../../../lib/company/officesStore';

/**
 * Look up the office manager email for a given office location.
 * Matches by case-insensitive name from office_info.json.
 */
async function getOfficeManagerEmail(officeLocation: string): Promise<string | null> {
  if (!officeLocation) return null;
  const offices = await readOffices();
  const normalized = officeLocation.trim().toLowerCase();
  const match = offices.find(o => o.name?.trim().toLowerCase() === normalized);
  return match?.email || null;
}

export const dynamic = 'force-dynamic';

/**
 * Send for Approval endpoint - used by verifiers (e.g., Laura) to:
 * 1. Save corrected invoice data
 * 2. Train the AI on corrections (via /api/gpt-train)
 * 3. Create a QBO bill
 * 4. Route the invoice to the approver (e.g., McKay) for final approval
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  // Apply rate limiting
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 100, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { invoiceId, correctedData, invoiceCategories, userComment, destination } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    // Verify user is a verifier
    const userIsVerifier = await isVerifier(user.email);
    if (!userIsVerifier) {
      console.log('[API][SEND-FOR-APPROVAL]', 'unauthorized_not_verifier', { userEmail: user.email });
      return NextResponse.json({ error: 'Only verifiers can use this endpoint' }, { status: 403 });
    }

    // Get the invoice
    const invoice = getInvoiceById(String(invoiceId));
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    console.log('[API][SEND-FOR-APPROVAL]', 'processing', { 
      invoiceId, 
      userEmail: user.email,
      hasCorrectedData: !!correctedData,
      hasCategories: !!invoiceCategories?.length
    });

    // Store original values for AI training
    const originalValues = {
      vendor_name: invoice.vendor_name || invoice.vendor || '',
      office_id: invoice.office_id || invoice.office || '',
      amount_cents: invoice.amount_cents || 0,
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.invoice_date || '',
      due_date: invoice.due_date || '',
    };

    // Step 1: Update invoice with corrected data
    if (correctedData) {
      if (correctedData.vendor_name) invoice.vendor_name = correctedData.vendor_name;
      if (correctedData.office_id) invoice.office_id = correctedData.office_id;
      if (correctedData.amount_cents) invoice.amount_cents = correctedData.amount_cents;
      if (correctedData.invoice_number) invoice.invoice_number = correctedData.invoice_number;
      if (correctedData.invoice_date) invoice.invoice_date = correctedData.invoice_date;
      if (correctedData.due_date) invoice.due_date = correctedData.due_date;
    }

    // Update invoice categories in the database if provided
    if (invoiceCategories && invoiceCategories.length > 0) {
      const db = getDatabase();
      // Delete existing categories
      db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(invoice.id);
      
      // Insert new categories
      const insertStmt = db.prepare(`
        INSERT INTO invoice_categories (id, invoice_id, category_id, category_name, class_name, amount_cents, confidence_score, source, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const { randomUUID } = require('crypto');
      invoiceCategories.forEach((cat: any, index: number) => {
        insertStmt.run(
          randomUUID(),
          invoice.id,
          cat.category_id || cat.categoryId || '52210',
          cat.category_name || cat.categoryName || null,
          cat.class_name || cat.className || null,
          cat.amount_cents || cat.amountCents || null,
          cat.confidence_score || cat.confidenceScore || 0.9,
          'user_correction',
          index
        );
      });
    }

    // Step 2: Train AI on corrections (fire-and-forget, don't block)
    let aiTrainingResult = { success: true, message: 'No changes to train' };
    const correctedValues = correctedData || {};
    const changedFields = Object.keys(correctedValues).filter(
      key => originalValues[key as keyof typeof originalValues] !== correctedValues[key]
    );

    if (changedFields.length > 0 || userComment) {
      try {
        const baseUrl = process.env.NEXTAUTH_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        
        const trainResponse = await fetch(`${baseUrl}/api/gpt-train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorName: correctedValues.vendor_name || originalValues.vendor_name,
            pdfPath: invoice.pdf_path || invoice.source_file,
            originalParsed: originalValues,
            correctedData: correctedValues,
            userComment: userComment || null,
          }),
        });

        if (trainResponse.ok) {
          const trainResult = await trainResponse.json();
          aiTrainingResult = { success: true, message: `AI trained v${trainResult.version}` };
          console.log('[API][SEND-FOR-APPROVAL]', 'ai_training_success', { 
            invoiceId, 
            version: trainResult.version 
          });
        } else {
          aiTrainingResult = { success: false, message: 'AI training request failed' };
          console.warn('[API][SEND-FOR-APPROVAL]', 'ai_training_failed', { invoiceId });
        }
      } catch (err: any) {
        aiTrainingResult = { success: false, message: err.message || 'AI training error' };
        console.error('[API][SEND-FOR-APPROVAL]', 'ai_training_error', { invoiceId, error: String(err) });
      }
    }

    // Step 3: Create QBO bill
    let qboBillResult: { success: boolean; billId?: string; error?: string } | null = null;
    try {
      console.log('[API][SEND-FOR-APPROVAL]', 'creating_qbo_bill', { invoiceId });
      qboBillResult = await createBillFromInvoice({
        invoiceData: invoice,
        invoiceId: String(invoiceId),
      });

      if (qboBillResult.success && qboBillResult.billId) {
        invoice.qbo_bill_id = qboBillResult.billId;
        invoice.qbo_bill_created_at = new Date().toISOString();
        console.log('[API][SEND-FOR-APPROVAL]', 'qbo_bill_created', { 
          invoiceId, 
          billId: qboBillResult.billId 
        });
      } else {
        console.warn('[API][SEND-FOR-APPROVAL]', 'qbo_bill_failed', { 
          invoiceId, 
          error: qboBillResult?.error 
        });
      }
    } catch (qboErr: any) {
      console.error('[API][SEND-FOR-APPROVAL]', 'qbo_bill_error', { 
        invoiceId, 
        error: String(qboErr) 
      });
      qboBillResult = { success: false, error: qboErr.message };
    }

    // Step 4: Route to approver based on destination choice
    let approverEmail: string;
    if (destination === 'office_manager') {
      // Route to the office manager for the invoice's location
      const officeLocation = invoice.office_location || invoice.office_id || '';
      const officeManagerEmail = await getOfficeManagerEmail(officeLocation);
      if (officeManagerEmail) {
        approverEmail = officeManagerEmail;
        console.log('[API][SEND-FOR-APPROVAL]', 'routing_to_office_manager', { invoiceId, office: officeLocation, manager: approverEmail });
      } else {
        // No office manager found for this location - fall back to admin
        approverEmail = getApprovalDestination();
        console.log('[API][SEND-FOR-APPROVAL]', 'office_manager_not_found_fallback_to_admin', { invoiceId, office: officeLocation });
      }
    } else {
      // Default: route to McKay (admin approval)
      approverEmail = getApprovalDestination();
    }
    
    invoice.current_assigned_user_email = approverEmail;
    invoice.status = 'awaiting_admin_approval';
    
    // Track who verified and when
    invoice.verified_by_user_id = user.email.toLowerCase();
    invoice.verified_at = new Date().toISOString();

    // Save the invoice
    saveInvoice(invoice);
    
    console.log('[API][SEND-FOR-APPROVAL]', 'success', { 
      invoiceId, 
      destination: destination || 'mckay',
      assignedTo: approverEmail,
      newStatus: invoice.status,
      qboBillCreated: qboBillResult?.success
    });

    return NextResponse.json({
      ok: true,
      invoice,
      aiTrainingResult,
      qboBill: qboBillResult ? {
        created: qboBillResult.success,
        billId: qboBillResult.billId,
        error: qboBillResult.error,
      } : null,
      assignedTo: approverEmail,
    });

  } catch (err: any) {
    console.error('[API][SEND-FOR-APPROVAL]', 'error', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: err.message || 'Failed to send for approval' },
      { status: 500 }
    );
  }
}
