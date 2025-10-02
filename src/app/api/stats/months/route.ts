import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT year, month, COUNT(*) as plays
    FROM plays
    GROUP BY year, month
    ORDER BY year ASC, month ASC
  `).all() as { year: number; month: number; plays: number }[];

  return NextResponse.json({ rows });
}


