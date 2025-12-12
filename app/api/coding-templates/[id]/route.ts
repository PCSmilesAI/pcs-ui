import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../lib/db/client';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coding-templates/[id]
 * Get a specific template with its rows
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const templateId = params.id;

  const userIsAdmin = await isAdmin(user.email);
  if (!userIsAdmin) {
    return NextResponse.json(
      { error: 'Only admins can view templates' },
      { status: 403 }
    );
  }

  try {
    const db = getDatabase();
    const template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(templateId) as any;

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Load template rows if table template
    let rows: any[] = [];
    if (template.template_type === 'table_template') {
      rows = db.prepare(`
        SELECT * FROM table_template_rows 
        WHERE template_id = ?
        ORDER BY created_at
      `).all(templateId) as any[];
    }

    return NextResponse.json({
      ok: true,
      template: {
        ...template,
        rows: rows,
      }
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES][GET]', 'error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/coding-templates/[id]
 * Update a template
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const templateId = params.id;

  const userIsAdmin = await isAdmin(user.email);
  if (!userIsAdmin) {
    return NextResponse.json(
      { error: 'Only admins can update templates' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      name,
      description,
      vendor_name,
      gl_account_name,
      template_type = 'table_template',
      allocation_mode = 'split_evenly',
      company_code,
      table_rows
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!vendor_name || typeof vendor_name !== 'string') {
      return NextResponse.json(
        { error: 'vendor_name is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate allocation_mode
    const validModes = ['split_evenly', 'fixed_amount', 'percentage'];
    if (!validModes.includes(allocation_mode)) {
      return NextResponse.json(
        { error: 'allocation_mode must be split_evenly, fixed_amount, or percentage' },
        { status: 400 }
      );
    }

    // Validate percentage total if percentage mode
    if (allocation_mode === 'percentage' && Array.isArray(table_rows)) {
      const percentTotal = table_rows.reduce((sum, row) => sum + (parseFloat(row.percentage) || 0), 0);
      if (Math.abs(percentTotal - 100) > 0.01) {
        return NextResponse.json(
          { error: `Percentage allocation must equal 100%. Current total: ${percentTotal.toFixed(1)}%` },
          { status: 400 }
        );
      }
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    // Update template with new fields
    db.prepare(`
      UPDATE coding_templates SET
        name = ?,
        description = ?,
        vendor_name = ?,
        gl_account_name = ?,
        template_type = ?,
        allocation_mode = ?,
        company_code = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name,
      description || null,
      vendor_name,
      gl_account_name || null,
      template_type,
      allocation_mode,
      company_code || null,
      now,
      templateId
    );

    // Delete existing rows and insert new ones
    db.prepare('DELETE FROM table_template_rows WHERE template_id = ?').run(templateId);

    if (Array.isArray(table_rows) && table_rows.length > 0) {
      for (const row of table_rows) {
        const rowId = uuidv4();
        const amountCents = row.amount ? Math.round((parseFloat(row.amount) || 0) * 100) : null;
        const percentage = row.percentage ? parseFloat(row.percentage) : null;

        db.prepare(`
          INSERT INTO table_template_rows (
            id, template_id, gl_account_path, category_name, description, class_name,
            location_name, amount_cents, percentage, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rowId,
          templateId,
          row.gl_account_path || '',
          row.category_name || '',
          row.description || '',
          row.class_name || '',
          row.location_name || '',
          amountCents,
          percentage,
          now
        );
      }
    }

    // Fetch updated template
    const updatedTemplate = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(templateId);

    return NextResponse.json({
      ok: true,
      template: updatedTemplate
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES][PUT]', 'error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coding-templates/[id]
 * Delete a template
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const templateId = params.id;

  const userIsAdmin = await isAdmin(user.email);
  if (!userIsAdmin) {
    return NextResponse.json(
      { error: 'Only admins can delete templates' },
      { status: 403 }
    );
  }

  try {
    const db = getDatabase();

    // Check if template is in use
    const inUse = db.prepare(`
      SELECT COUNT(*) as count FROM invoices WHERE coding_template_id = ?
    `).get(templateId) as any;

    if (inUse && inUse.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete template that is assigned to invoices' },
        { status: 400 }
      );
    }

    // Delete template rows
    db.prepare('DELETE FROM table_template_rows WHERE template_id = ?').run(templateId);

    // Delete template
    db.prepare('DELETE FROM coding_templates WHERE id = ?').run(templateId);

    return NextResponse.json({
      ok: true,
      message: 'Template deleted successfully'
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES][DELETE]', 'error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


