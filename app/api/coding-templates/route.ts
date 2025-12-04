import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { readRoles, isAdmin } from '../../../lib/workflow/rolesStore';
import {
  getAllCodingTemplates,
  getCodingTemplatesByVendor,
  createCodingTemplate,
  getAllClinics
} from '../../../lib/invoices/coding-template-service';
import { getDatabase } from '../../../lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coding-templates
 * 
 * List all coding templates or filter by vendor.
 * Query params:
 *   - vendor: filter by vendor name
 * 
 * Accessible to: AP Managers, Admins
 */
export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  const roles = await readRoles();

  // Check authorization
  const isAPManager = roles.ap_authorizers.some(
    (email: string) => email.toLowerCase() === user.email.toLowerCase()
  );
  const isUserAdmin = await isAdmin(user.email);

  if (!isAPManager && !isUserAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const vendor = searchParams.get('vendor');

    let templates;
    if (vendor) {
      templates = getCodingTemplatesByVendor(vendor);
    } else {
      templates = getAllCodingTemplates();
    }

    return NextResponse.json({
      ok: true,
      templates
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES]', 'GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coding-templates
 * 
 * Create a new coding template.
 * Only admins can create templates.
 * 
 * Request body:
 * {
 *   "name": "IT Support Services",
 *   "vendor_name": "IT Vendor Name",
 *   "gl_account_name": "IT Support Services"
 * }
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  // Only admins can create templates
  const userIsAdmin = await isAdmin(user.email);
  if (!userIsAdmin) {
    return NextResponse.json(
      { error: 'Only admins can create coding templates' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { 
      name, 
      vendor_name, 
      gl_account_name, 
      template_type = 'even_split',
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

    const db = getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const templateId = uuidv4();
    const now = new Date().toISOString();

    // Insert template
    db.prepare(`
      INSERT INTO coding_templates (
        id, name, vendor_name, allocation_type, apply_to_locations,
        gl_account_name, created_by_user_id, is_active, created_at, updated_at,
        template_type, company_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      name,
      vendor_name,
      'equal_split',
      'all_locations',
      gl_account_name || null,
      user.email,
      1,
      now,
      now,
      template_type,
      company_code || null
    );

    // If table template, insert rows
    if (template_type === 'table_template' && Array.isArray(table_rows) && table_rows.length > 0) {
      for (const row of table_rows) {
        const rowId = uuidv4();
        const amountCents = Math.round((parseFloat(row.amount) || 0) * 100);
        
        db.prepare(`
          INSERT INTO table_template_rows (
            id, template_id, gl_account_path, category_name, class_name,
            location_name, amount_cents, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rowId,
          templateId,
          row.gl_account_path || '',
          row.category_name || '',
          row.class_name || '',
          row.location_name || '',
          amountCents,
          now
        );
      }
    }

    // Fetch created template
    const template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(templateId);

    console.log('[API][CODING_TEMPLATES]', 'created', {
      templateId: template.id,
      name,
      vendor_name,
      template_type,
      createdBy: user.email
    });

    return NextResponse.json({
      ok: true,
      template
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES]', 'POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

