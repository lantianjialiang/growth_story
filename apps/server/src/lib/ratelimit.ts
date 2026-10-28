import { AppError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * 进程内固定窗口限流，够家用规模使用。
 * 触发时抛 429，并带 Retry-After 语义（由上层写 header）。
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new AppError(429, 'too_many_requests', '操作太频繁，请稍后再试');
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'local';
}

export function resetRateLimits(): void {
  buckets.clear();
}
