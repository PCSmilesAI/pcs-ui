import { NextRequest, NextResponse } from 'next/server';
import { pickMappingForVendor } from '../../../../lib/qbo/vendorMappings';
import { resolveAccountByFullName, resolveClassByFullName } from '../../../../lib/qbo/qboLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const vendor = req.nextUrl.searchParams.get('vendor') || '';

    if (!vendor.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing vendor query parameter' }, { status: 400 });
    }

    const mapping = await pickMappingForVendor(vendor);

    let resolvedAccount: Awaited<ReturnType<typeof resolveAccountByFullName>> | undefined;
    let resolvedClass: Awaited<ReturnType<typeof resolveClassByFullName>> | undefined;

    if (mapping?.accountPath) {
      resolvedAccount = await resolveAccountByFullName(mapping.accountPath);
    }
    if (mapping?.classPath) {
      resolvedClass = await resolveClassByFullName(mapping.classPath);
    }

    return NextResponse.json({
      ok: true,
      inputVendor: vendor,
      matchedVendor: mapping?.matchedVendor || null,
      chosenAccountPath: mapping?.accountPath || null,
      chosenClassPath: mapping?.classPath || null,
      resolvedAccount: resolvedAccount
        ? { id: resolvedAccount.id, name: resolvedAccount.name, fullName: resolvedAccount.fullName, type: resolvedAccount.type }
        : null,
      resolvedClass: resolvedClass ? { id: resolvedClass.id, name: resolvedClass.name, fullName: resolvedClass.fullName } : null,
      strategy: mapping ? 'json-history' : 'history-missing'
    });

  } catch (error: any) {
    console.error('[QBO][MAPPING_PREVIEW] error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Internal server error' }, { status: 500 });
  }
}


