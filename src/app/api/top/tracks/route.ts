import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
  const minMs = Math.max(0, Number(searchParams.get('minMs') ?? 0));
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };
  if (start) { where.push('played_at >= @start'); params.start = new Date(start).toISOString(); }
  if (end) { where.push('played_at <= @end'); params.end = new Date(end).toISOString(); }
  if (minMs > 0) { where.push('ms_played >= @minMs'); params.minMs = minMs; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  const total = db.prepare(`
    SELECT COUNT(*) as c FROM (
      SELECT 1
      FROM plays
      ${whereSql}
    ) t
  `).get(params) as { c: number };

  const rows = db.prepare(`
    SELECT track_name as name,
           artist_name as artist,
           album_name as album,
           COUNT(*) as plays
    FROM plays
    ${whereSql}
    ORDER BY plays DESC
    LIMIT @limit OFFSET @offset
  `).all(params) as { name: string; artist: string; album: string; plays: number }[];

  return NextResponse.json({ total: total.c, rows });
}


