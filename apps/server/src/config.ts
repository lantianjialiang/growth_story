import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

// 允许 .env（不引入 dotenv 依赖）
for (const candidate of [path.join(SERVER_ROOT, '.env'), path.join(SERVER_ROOT, '../../.env')]) {
  if (fs.existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      /* ignore */
    }
  }
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dataDir: process.env.DATA_DIR
    ? path.resolve(SERVER_ROOT, process.env.DATA_DIR)
    : path.join(SERVER_ROOT, 'data'),
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 30),
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  cookieName: process.env.COOKIE_NAME ?? 'ga_session',
  trustOrigin: process.env.PUBLIC_ORIGIN ?? '',
  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
  trashRetentionDays: num(process.env.TRASH_RETENTION_DAYS, 30),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export const paths = {
  db: path.join(config.dataDir, 'growth.db'),
  uploads: path.join(config.dataDir, 'uploads'),
  exports: path.join(config.dataDir, 'tmp-exports'),
  webDist: path.resolve(SERVER_ROOT, '../web/dist'),
};

export function ensureDirs(): void {
  for (const dir of [config.dataDir, paths.uploads, paths.exports]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
