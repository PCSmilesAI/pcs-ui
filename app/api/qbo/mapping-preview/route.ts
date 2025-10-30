import { NextRequest, NextResponse } from 'next/server';
import { pickMappingForVendor } from '../../../../lib/qbo/vendorMappings';
import { resolveAccountByFullName, resolveClassByFullName } from '../../../../lib/qbo/qboLookup';

function toGeneralClassForOffice(office?: string): string | undefined {
  if (!office) return undefined;
  const raw = String(office).trim();
  if (!raw) return undefined;
  const normalized = raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bmilwaukee\b/g, 'milwaukie')
    .replace(/\bgp\b/g, 'grants pass');
  const title = normalized.replace(/\b\w/g, (c) => c.toUpperCase());
  const trimmed = title.replace(/^General[-\s]*/i, '');
  return `General-${trimmed}`;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const vendor = req.nextUrl.searchParams.get('vendor') || '';
    const office = req.nextUrl.searchParams.get('office') || '';

    if (!vendor.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing vendor query parameter' }, { status: 400 });
    }

    const mapping = await pickMappingForVendor(vendor);
    // If user provided an office, prefer General-<Office>
    let chosenClassPath = mapping?.classPath;
    const officeClass = toGeneralClassForOffice(office);
    if (!chosenClassPath && officeClass && Array.isArray((mapping as any)?.classCandidates)) {
      const key = officeClass.replace(/\s+/g, '').toLowerCase();
      const hit = (mapping as any).classCandidates.find((c: string) =>
        typeof c === 'string' && c.replace(/\s+/g, '').toLowerCase() === key
      );
      if (hit) chosenClassPath = hit;
    }

    let resolvedAccount: Awaited<ReturnType<typeof resolveAccountByFullName>> | undefined;
    let resolvedClass: Awaited<ReturnType<typeof resolveClassByFullName>> | undefined;

    if (mapping?.accountPath) {
      resolvedAccount = await resolveAccountByFullName(mapping.accountPath);
    }
    if (chosenClassPath) {
      resolvedClass = await resolveClassByFullName(chosenClassPath);
    }

    return NextResponse.json({
      ok: true,
      inputVendor: vendor,
      matchedVendor: mapping?.matchedVendor || null,
      chosenAccountPath: mapping?.accountPath || null,
      chosenClassPath: chosenClassPath || mapping?.classPath || null,
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


