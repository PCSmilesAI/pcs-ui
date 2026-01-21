import { NextRequest, NextResponse } from 'next/server';
import {
  getAllKnowledgeBases,
  getAllSystemPrompts,
  upsertKnowledgeBase,
  updateSystemPrompt,
  getKnowledgeBaseStats,
  searchKnowledgeBases
} from '../../../lib/gpt/knowledgeBase';

export const dynamic = 'force-dynamic';

// Admin email whitelist
const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

function isAdmin(request: NextRequest): boolean {
  // Check for admin email in cookie or header
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
 * GET /api/knowledge-base
 * Get all knowledge bases and system prompts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const statsOnly = searchParams.get('stats') === 'true';

    if (statsOnly) {
      const stats = getKnowledgeBaseStats();
      return NextResponse.json(stats);
    }

    let knowledgeBases;
    if (search) {
      knowledgeBases = searchKnowledgeBases(search);
    } else {
      knowledgeBases = getAllKnowledgeBases();
    }

    const systemPrompts = getAllSystemPrompts();

    return NextResponse.json({
      knowledgeBases,
      systemPrompts,
      count: knowledgeBases.length
    });
  } catch (error: any) {
    console.error('[API] Knowledge base GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch knowledge bases' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge-base
 * Create or update a knowledge base or system prompt
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin access
    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, vendorName, promptName, promptText, description } = body;

    if (type === 'vendor' || type === 'knowledge_base') {
      // Create/update vendor knowledge base
      if (!vendorName || !promptText) {
        return NextResponse.json(
          { error: 'vendorName and promptText are required' },
          { status: 400 }
        );
      }

      const result = upsertKnowledgeBase(vendorName, promptText);
      return NextResponse.json({
        success: true,
        knowledgeBase: result
      });
    }

    if (type === 'system' || type === 'system_prompt') {
      // Create/update system prompt
      if (!promptName || !promptText) {
        return NextResponse.json(
          { error: 'promptName and promptText are required' },
          { status: 400 }
        );
      }

      const result = updateSystemPrompt(promptName, promptText, description);
      return NextResponse.json({
        success: true,
        systemPrompt: result
      });
    }

    return NextResponse.json(
      { error: 'Invalid type. Use "vendor" or "system"' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[API] Knowledge base POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save knowledge base' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/knowledge-base
 * Batch update multiple knowledge bases
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'updates must be an array' },
        { status: 400 }
      );
    }

    const results: Array<{ vendorName?: string; promptName?: string; success: boolean; version?: number }> = [];
    for (const update of updates) {
      if (update.type === 'vendor' && update.vendorName && update.promptText) {
        const result = upsertKnowledgeBase(update.vendorName, update.promptText);
        results.push({ vendorName: update.vendorName, success: true, version: result.version });
      } else if (update.type === 'system' && update.promptName && update.promptText) {
        updateSystemPrompt(update.promptName, update.promptText);
        results.push({ promptName: update.promptName, success: true });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error: any) {
    console.error('[API] Knowledge base PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to batch update' },
      { status: 500 }
    );
  }
}
