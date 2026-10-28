import fs from 'node:fs';
import path from 'node:path';
import type { Sqlite } from './client.js';

/**
 * 极简迁移执行器：按文件名顺序执行 drizzle/*.sql，记录到 __migrations。
 * 迁移文件不允许回头修改，只能新增。
 */
export function migrate(sqlite: Sqlite, dir: string): string[] {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM __migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const freshly: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const run = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)')
        .run(file, new Date().toISOString());
    });
    run();
    freshly.push(file);
  }
  return freshly;
}
