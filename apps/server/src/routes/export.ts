import fs from 'node:fs';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../auth/middleware.js';
import { requireUser } from '../auth/middleware.js';
import { exportJobs } from '../db/schema.js';
import { AppError, notFound } from '../lib/errors.js';
import { streamFileBody } from '../lib/fileStream.js';
import { logger } from '../lib/logger.js';
import { exportProfile } from '../services/exporter.js';
import { requireProfileAccess } from '../services/permissions.js';
import { enqueue } from '../jobs/queue.js';

export const exportRoutes = new Hono<AppEnv>();

exportRoutes.post('/profiles/:id/export', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const { profile } = requireProfileAccess(client, c.req.param('id'), user, 'manage');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  client.db
    .insert(exportJobs)
    .values({ id, profileId: profile.id, userId: user.id, status: 'processing', createdAt: now })
    .run();

  enqueue(async () => {
    try {
      const result = await exportProfile(client, profile.id, id);
      client.db
        .update(exportJobs)
        .set({ status: 'ready', filePath: result.filePath, finishedAt: new Date().toISOString() })
        .where(eq(exportJobs.id, id))
        .run();
    } catch (err) {
      logger.error({ err, jobId: id }, 'export failed');
      client.db
        .update(exportJobs)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : 'unknown',
          finishedAt: new Date().toISOString(),
        })
        .where(eq(exportJobs.id, id))
        .run();
    }
  });

  return c.json({ id, status: 'processing' }, 202);
});

exportRoutes.get('/exports/:jobId', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const job = client.db.select().from(exportJobs).where(eq(exportJobs.id, c.req.param('jobId'))).get();
  if (!job || job.userId !== user.id) throw notFound('导出任务不存在');
  return c.json({
    export: {
      id: job.id,
      status: job.status,
      url: job.status === 'ready' ? `/api/v1/exports/${job.id}/download` : null,
    },
  });
});

exportRoutes.get('/exports/:jobId/download', (c) => {
  const user = requireUser(c);
  const client = c.get('client');
  const job = client.db.select().from(exportJobs).where(eq(exportJobs.id, c.req.param('jobId'))).get();
  if (!job || job.userId !== user.id) throw notFound('导出任务不存在');
  if (job.status !== 'ready' || !job.filePath) throw new AppError(409, 'not_ready', '导出文件还未准备好');
  if (!fs.existsSync(job.filePath)) throw notFound('导出文件已过期');

  const stat = fs.statSync(job.filePath);
  const profileName = client.sqlite
    .prepare('SELECT name FROM profiles WHERE id = ?')
    .get(job.profileId) as { name: string } | undefined;
  const filename = encodeURIComponent(`${profileName?.name ?? 'profile'}-${job.createdAt.slice(0, 10)}.zip`);

  c.header('Content-Type', 'application/zip');
  c.header('Content-Length', String(stat.size));
  c.header('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  return c.body(streamFileBody(job.filePath));
});
