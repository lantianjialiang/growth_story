import { hash, verify } from '@node-rs/argon2';

// argon2id，参数按 OWASP 建议（19MiB / 2 次迭代）
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2 as const,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS);
  } catch {
    return false;
  }
}
