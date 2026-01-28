import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getVendorTemplatePreference } from '../../../../../lib/gpt/knowledgeBase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vendors/{name}/template-preference
 * 
 * Get the preferred coding template for a vendor (if any).
 * This is used to auto-suggest templates when viewing invoices from this vendor.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const user = getCurrentUser(req);
  const { name: vendorName } = await params;

  if (!user.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const decodedVendorName = decodeURIComponent(vendorName);
    const preference = getVendorTemplatePreference(decodedVendorName);

    if (!preference) {
      return NextResponse.json({
        hasPreference: false,
        templateId: null,
        templateName: null
      });
    }

    return NextResponse.json({
      hasPreference: true,
      templateId: preference.templateId,
      templateName: preference.templateName
    });
  } catch (error: any) {
    console.error('[API][VENDOR_TEMPLATE_PREFERENCE]', 'error', {
      vendorName,
      message: error?.message
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
