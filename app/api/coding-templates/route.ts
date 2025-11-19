import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { readRoles, isAdmin } from '../../../lib/workflow/rolesStore';
import {
  getAllCodingTemplates,
  getCodingTemplatesByVendor,
  createCodingTemplate,
  getAllClinics
} from '../../../lib/invoices/coding-template-service';

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
    const { name, vendor_name, gl_account_name } = body;

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

    if (!gl_account_name || typeof gl_account_name !== 'string') {
      return NextResponse.json(
        { error: 'gl_account_name is required and must be a string' },
        { status: 400 }
      );
    }

    // Create template
    const template = createCodingTemplate(
      name,
      vendor_name,
      gl_account_name,
      user.email
    );

    console.log('[API][CODING_TEMPLATES]', 'created', {
      templateId: template.id,
      name,
      vendor_name,
      createdBy: user.email
    });

    return NextResponse.json({
      ok: true,
      template
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES]', 'POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

