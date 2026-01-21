import { NextRequest, NextResponse } from 'next/server';
import {
  getKnowledgeBase,
  upsertKnowledgeBase,
  deleteKnowledgeBase,
  getOrCreateKnowledgeBase
} from '../../../../lib/gpt/knowledgeBase';

export const dynamic = 'force-dynamic';

// Admin email whitelist
const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

function isAdmin(request: NextRequest): boolean {
  const userCookie = request.cookies.get('loggedInUser');
  if (userCookie) {
    try {
      const user = JSON.parse(userCookie.value);
      return ADMIN_EMAILS.has(user.email?.toLowerCase());
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * GET /api/knowledge-base/[vendor]
 * Get knowledge base for a specific vendor
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  try {
    const { vendor } = await params;
    const vendorName = decodeURIComponent(vendor);

    const { searchParams } = new URL(request.url);
    const createIfMissing = searchParams.get('create') === 'true';

    let knowledgeBase;
    if (createIfMissing) {
      knowledgeBase = getOrCreateKnowledgeBase(vendorName);
    } else {
      knowledgeBase = getKnowledgeBase(vendorName);
    }

    if (!knowledgeBase) {
      return NextResponse.json(
        { error: 'Knowledge base not found', vendorName },
        { status: 404 }
      );
    }

    return NextResponse.json({
      knowledgeBase,
      vendorName
    });
  } catch (error: any) {
    console.error('[API] Knowledge base GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch knowledge base' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/knowledge-base/[vendor]
 * Update knowledge base for a specific vendor
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { vendor } = await params;
    const vendorName = decodeURIComponent(vendor);
    const body = await request.json();
    const { promptText, knowledge_prompt } = body;

    const newPrompt = promptText || knowledge_prompt;
    if (!newPrompt) {
      return NextResponse.json(
        { error: 'promptText or knowledge_prompt is required' },
        { status: 400 }
      );
    }

    const result = upsertKnowledgeBase(vendorName, newPrompt);

    return NextResponse.json({
      success: true,
      knowledgeBase: result
    });
  } catch (error: any) {
    console.error('[API] Knowledge base PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update knowledge base' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/knowledge-base/[vendor]
 * Delete knowledge base for a specific vendor
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { vendor } = await params;
    const vendorName = decodeURIComponent(vendor);

    const deleted = deleteKnowledgeBase(vendorName);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Knowledge base not found', vendorName },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      vendorName,
      deleted: true
    });
  } catch (error: any) {
    console.error('[API] Knowledge base DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete knowledge base' },
      { status: 500 }
    );
  }
}
