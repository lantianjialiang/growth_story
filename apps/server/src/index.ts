import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config, ensureDirs, paths } from './config.js';
import { createClient } from './db/client.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { purgeExpiredTrash } from './routes/trash.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../drizzle');

ensureDirs();
const client = createClient(paths.db);
const applied = migrate(client.sqlite, migrationsDir);
if (applied.length > 0) logger.info({ applied }, 'database migrated');

const app = createApp(client);

async function runCleanup() {
  try {
    const result = await purgeExpiredTrash(client, config.trashRetentionDays);
    if (result.media + result.events + result.profiles > 0) {
      logger.info(result, 'purged expired trash');
    }
  } catch (err) {
    logger.error({ err }, 'trash purge failed');
  }
}

void runCleanup();
const cleanupTimer = setInterval(() => void runCleanup(), 6 * 3600 * 1000);
cleanupTimer.unref();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  logger.info(
    { port: info.port, host: config.host, dataDir: config.dataDir, env: config.nodeEnv },
    'growth-archive server started',
  );
});

// 端口占用之类的监听失败属于致命错误：进程活着但没在服务任何人，必须退出
server.on('error', (err) => {
  logger.fatal({ err, port: config.port }, 'failed to start server');
  process.exit(1);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    client.sqlite.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 兜底：异步 IO（响应用户中断、文件读取、socket 复位）里的异常不应该打死整个服务。
// 这类错误发生在微任务里，路由的 try/catch 抓不到；记录完整堆栈后继续提供服务。
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception, server keeps running');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection, server keeps running');
});
