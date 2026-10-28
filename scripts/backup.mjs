import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

/**
 * 备份数据目录（SQLite + 原图）为一个 ZIP。
 * 用法：npm run backup [outputDir]
 */
const root = path.resolve(import.meta.dirname, '..');
const dataDir = process.env.DATA_DIR
  ? path.resolve(root, 'apps/server', process.env.DATA_DIR)
  : path.join(root, 'apps/server/data');

if (!fs.existsSync(dataDir)) {
  console.error(`数据目录不存在：${dataDir}`);
  process.exit(1);
}

const outDir = path.resolve(process.argv[2] ?? path.join(root, 'backups'));
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')
  .replace('T', '-');
const outFile = path.join(outDir, `growth-backup-${stamp}.zip`);

const output = fs.createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 6 } });

archive.on('warning', (err) => console.warn('warning:', err.message));
archive.on('error', (err) => {
  console.error('备份失败：', err);
  process.exit(1);
});
output.on('close', () => {
  console.log(`✅ 备份完成：${outFile}（${(archive.pointer() / 1024 / 1024).toFixed(2)} MB）`);
  console.log('   恢复方式：停止服务 → 解压覆盖 data/ → 重新启动。');
});

archive.pipe(output);
// SQLite 的 -wal / -shm 也一起打包，保证一致
archive.directory(dataDir, 'data', (entry) => {
  if (entry.name.includes('tmp-exports')) return false;
  return entry;
});
await archive.finalize();
