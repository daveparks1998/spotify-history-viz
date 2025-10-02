import path from 'node:path';
import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = path.join(process.cwd(), 'data', 'db.sqlite');
  dbInstance = new Database(dbPath, { readonly: false });
  dbInstance.pragma('journal_mode = WAL');
  return dbInstance;
}

export type Row = Record<string, unknown>;


