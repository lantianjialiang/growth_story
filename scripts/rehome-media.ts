/**
 * 把历史照片从 `uploads/<profileId>/<mediaId>/` 搬到可读目录：
 * `uploads/<档案名>-<档案id8>/<YYYY-MM>/<原文件名>-<媒体id8>/`。
 *
 * 用法：
 *   npx tsx scripts/rehome-media.ts --dry    # 只打印计划，不动文件
 *   npx tsx scripts/rehome-media.ts          # 真的搬（先停掉服务再跑更稳妥）
 *
 * 说明：数据库里存的是完整相对路径，搬完会同步更新 media.original_path 与 variants，
 * 重复运行是安全的（已经在新目录的会直接跳过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildMediaKeyPrefix } from '../apps/server/src/media/pipeline.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const dataArg = args.find((arg) => !arg.startsWith('--'));
const dataDir = path.resolve(dataArg ?? 'apps/server/data');
const uploadsDir = path.join(dataDir, 'uploads');
const dbPath = path.join(dataDir, 'growth.db');

if (!fs.existsSync(dbPath)) {
  console.error(`找不到数据库：${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

interface ProfileRow {
  id: string;
  name: string;
}
interface MediaRow {
  id: string;
  profile_id: string;
  original_path: string;
  original_name: string | null;
  alt_text: string | null;
  event_title: string | null;
  variants: string;
  created_at: string;
  taken_at: string | null;
}

const profiles = new Map<string, ProfileRow>(
  (db.prepare('SELECT id, name FROM profiles').all() as ProfileRow[]).map((row) => [row.id, row]),
);
const rows = db
  .prepare(
    `SELECT m.id, m.profile_id, m.original_path, m.original_name, m.alt_text, m.variants, m.created_at, m.taken_at,
            e.title AS event_title
       FROM media m LEFT JOIN events e ON e.id = m.event_id`,
  )
  .all() as MediaRow[];

function moveFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

let moved = 0;
let skipped = 0;
const update = db.prepare(
  'UPDATE media SET original_path = ?, variants = ?, original_name = COALESCE(original_name, ?) WHERE id = ?',
);

for (const row of rows) {
  const profile = profiles.get(row.profile_id);
  if (!profile) {
    console.log(`跳过 ${row.id}：档案不存在`);
    skipped += 1;
    continue;
  }

  const oldOriginal = path.join(uploadsDir, row.original_path);
  // 老数据没记原始文件名：退而用图片说明 / 事件标题，实在没有就叫 photo
  const stem =
    row.original_name ??
    (row.alt_text ? `${row.alt_text}.jpg` : null) ??
    (row.event_title ? `${row.event_title}.jpg` : path.basename(row.original_path));
  const prefix = buildMediaKeyPrefix({
    profileName: profile.name,
    profileId: profile.id,
    mediaId: row.id,
    fileName: stem,
    uploadedAt: new Date(row.taken_at ?? row.created_at),
  });

  const oldDir = path.dirname(row.original_path).replaceAll('\\', '/');
  if (oldDir === prefix) {
    skipped += 1;
    continue;
  }
  if (!fs.existsSync(oldOriginal)) {
    console.log(`跳过 ${row.id}：原图文件不存在（${row.original_path}）`);
    skipped += 1;
    continue;
  }

  const ext = path.extname(row.original_path) || '.jpg';
  const newOriginal = `${prefix}/original${ext}`;
  const newVariants = { thumb: `${prefix}/thumb.webp`, medium: `${prefix}/medium.webp` };
  let variants: Record<string, string> = {};
  try {
    variants = JSON.parse(row.variants) as Record<string, string>;
  } catch {
    variants = {};
  }

  console.log(`${row.original_path}\n  → ${newOriginal}`);
  if (dryRun) {
    moved += 1;
    continue;
  }

  moveFile(oldOriginal, path.join(uploadsDir, newOriginal));
  for (const key of Object.values(variants)) {
    const from = path.join(uploadsDir, key);
    if (!fs.existsSync(from)) continue;
    const targetKey = path.basename(key) === 'thumb.webp' ? newVariants.thumb : newVariants.medium;
    moveFile(from, path.join(uploadsDir, targetKey));
  }

  update.run(newOriginal, JSON.stringify(newVariants), stem, row.id);
  moved += 1;

  // 清掉搬空的旧目录（只删空目录，绝不递归删文件）
  for (const dir of [path.dirname(oldDir), oldDir]) {
    const abs = path.join(uploadsDir, dir);
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    } catch {
      /* ignore */
    }
  }
}

console.log(`\n${dryRun ? '预演' : '完成'}：处理 ${moved} 张，跳过 ${skipped} 张。`);
db.close();
