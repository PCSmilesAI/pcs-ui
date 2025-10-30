import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeJoin(baseDir: string, segments: string[]): string | null {
  const target = path.resolve(baseDir, ...segments);
  const resolvedBase = path.resolve(baseDir);
  if (!target.startsWith(resolvedBase)) return null;
  return target;
}

export async function GET(_req: NextRequest, ctx: { params: { file: string[] } }) {
  try {
    const segments = Array.isArray(ctx.params?.file) ? ctx.params.file : [];
    if (segments.length === 0) {
      return NextResponse.json({ ok: false, error: 'Missing file path' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'output_jsons');
    const target = safeJoin(baseDir, segments);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Invalid path' }, { status: 400 });
    }

    if (!target.endsWith('.json')) {
      return NextResponse.json({ ok: false, error: 'Only .json files allowed' }, { status: 400 });
    }

    if (!fs.existsSync(target)) {
      return NextResponse.json({ ok: false, error: 'File not found' }, { status: 404 });
    }

    const raw = fs.readFileSync(target, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Internal server error' }, { status: 500 });
  }
}


