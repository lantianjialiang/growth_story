import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { contextMiddleware, originGuard, type AppEnv } from './auth/middleware.js';
import { paths } from './config.js';
import type { DbClient } from './db/client.js';
import { AppError } from './lib/errors.js';
import { streamFileBody } from './lib/fileStream.js';
import { logger } from './lib/logger.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { exportRoutes } from './routes/export.js';
import { mediaRoutes } from './routes/media.js';
import { profileRoutes } from './routes/profiles.js';
import { publicRoutes } from './routes/public.js';
import { shareRoutes } from './routes/share.js';
import { taxonomyRoutes } from './routes/taxonomy.js';
import { trashRoutes } from './routes/trash.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function createApp(client: DbClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', contextMiddleware(client));
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  });
  app.use('/api/*', originGuard());

  app.get('/api/v1/health', (c) =>
    c.json({ status: 'ok', service: 'growth-archive', time: new Date().toISOString() }),
  );

  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1', adminRoutes);
  app.route('/api/v1', profileRoutes);
  app.route('/api/v1', eventRoutes);
  app.route('/api/v1', taxonomyRoutes);
  app.route('/api/v1', mediaRoutes);
  app.route('/api/v1', shareRoutes);
  app.route('/api/v1', trashRoutes);
  app.route('/api/v1', exportRoutes);
  app.route('/api/v1', publicRoutes);

  app.all('/api/*', (c) =>
    c.json({ error: { code: 'not_found', message: '接口不存在' } }, 404),
  );

  // 生产环境：单进程同时托管前端静态文件 + SPA 路由回退
  const indexFile = path.join(paths.webDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.get('*', async (c) => {
      const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
      if (urlPath.includes('..')) return c.text('Not found', 404);

      const candidate = path.join(paths.webDist, urlPath);
      if (urlPath !== '/' && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        c.header(
          'Cache-Control',
          urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
        return c.body(streamFileBody(candidate), 200, {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
        });
      }
      c.header('Cache-Control', 'no-cache');
      return c.html(fs.readFileSync(indexFile, 'utf8'));
    });
  } else {
    app.get('/', (c) =>
      c.text('前端尚未构建。开发环境请访问 http://localhost:5173，或先执行 npm run build。'),
    );
  }

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err }, 'app error');
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status as 400,
      );
    }
    logger.error({ err, path: c.req.path }, 'unhandled error');
    return c.json({ error: { code: 'internal_error', message: '服务暂时不可用' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: '页面不存在' } }, 404));

  return app;
}
