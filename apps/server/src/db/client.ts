import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Sqlite = BetterSqlite3.Database;

export interface DbClient {
  sqlite: Sqlite;
  db: ReturnType<typeof drizzle<typeof schema>>;
}

export function createClient(file = ':memory:'): DbClient {
  const sqlite = new BetterSqlite3(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export { schema };
