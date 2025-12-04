import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../../lib/workflow/rolesStore';
import { getDatabase } from '../../../../../lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coding-templates/[id]/rows
 * Get template rows for a specific template
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
      { error: 'Only admins can view template rows' },
      { status: 403 }
    );
  }

  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM table_template_rows 
      WHERE template_id = ?
      ORDER BY created_at
    `).all(templateId) as any[];

    return NextResponse.json({
      ok: true,
      rows: rows
    });
  } catch (error: any) {
    console.error('[API][CODING_TEMPLATES][ROWS]', 'error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


