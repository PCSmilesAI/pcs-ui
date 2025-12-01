import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAP } from '@/lib/workflow/rolesStore';
import { createLocalLLMClient } from '@/lib/ai/localLLMClient';

/**
 * Save notes for an invoice and send to LLM if user is admin/AP
 * POST /api/invoices/[id]/notes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(req);
    const invoiceId = params.id;
    const db = getDatabase();

    // Check authorization - only admins and AP managers can add notes
    const isAuthorized = await isAP(user.email);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Only admins and AP managers can add notes' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { note } = body;

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json(
        { error: 'Note is required' },
        { status: 400 }
      );
    }

    // Load invoice for context
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Store note in database (create invoice_notes table if needed)
    const now = new Date().toISOString();
    const noteId = `${invoiceId}_${Date.now()}`;
    
    // Ensure invoice_notes table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_notes (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        note TEXT NOT NULL,
        user_email TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
    `);

    db.prepare(`
      INSERT INTO invoice_notes (id, invoice_id, note, user_email, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(noteId, invoiceId, note.trim(), user.email, now);

    // Send to LLM for feedback processing
    const llmClient = createLocalLLMClient();
    if (llmClient) {
      try {
        const prompt = `User feedback on invoice parsing:
Invoice Number: ${invoice.invoice_number || 'N/A'}
Vendor: ${invoice.vendor_name || 'N/A'}
Amount: $${((invoice.amount_cents || 0) / 100).toFixed(2)}

User Note: ${note.trim()}

Use this feedback to improve parsing accuracy for similar invoices.`;

        await llmClient.train(prompt);
        console.log('[API][INVOICES][NOTES] Sent to LLM:', { invoiceId, userEmail: user.email });
      } catch (llmError) {
        console.warn('[API][INVOICES][NOTES] Failed to send to LLM:', llmError);
        // Don't fail the request if LLM is unavailable
      }
    }

    // Get notes history
    const history = db.prepare(`
      SELECT note, user_email, created_at
      FROM invoice_notes
      WHERE invoice_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(invoiceId) as Array<{
      note: string;
      user_email: string;
      created_at: string;
    }>;

    return NextResponse.json({
      success: true,
      currentNote: note.trim(),
      history: history.map(h => ({
        note: h.note,
        user_email: h.user_email,
        created_at: h.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[API][INVOICES][NOTES] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save note' },
      { status: 500 }
    );
  }
}

/**
 * Get notes for an invoice
 * GET /api/invoices/[id]/notes
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    const db = getDatabase();

    // Ensure invoice_notes table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_notes (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        note TEXT NOT NULL,
        user_email TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
    `);

    const notes = db.prepare(`
      SELECT note, user_email, created_at
      FROM invoice_notes
      WHERE invoice_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(invoiceId) as Array<{
      note: string;
      user_email: string;
      created_at: string;
    }>;

    return NextResponse.json({
      success: true,
      currentNote: notes.length > 0 ? notes[0].note : '',
      history: notes.map(n => ({
        note: n.note,
        user_email: n.user_email,
        created_at: n.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[API][INVOICES][NOTES] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load notes' },
      { status: 500 }
    );
  }
}

