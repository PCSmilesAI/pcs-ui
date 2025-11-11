import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates that a path segment is safe (no path traversal attempts)
 */
function isValidSegment(segment: string): boolean {
  // Reject empty segments, dots, and path separators
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
    return false;
  }
  // Only allow alphanumeric, dots, dashes, underscores
  return /^[a-zA-Z0-9._-]+$/.test(segment);
}

/**
 * Safely joins path segments with proper validation
 */
function safeJoin(baseDir: string, segments: string[]): string | null {
  // Validate all segments
  if (!segments.every(isValidSegment)) {
    return null;
  }

  const target = path.resolve(baseDir, ...segments);
  const resolvedBase = path.resolve(baseDir);

  // Ensure target is within base directory
  if (!target.startsWith(resolvedBase + path.sep) && target !== resolvedBase) {
    return null;
  }

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


