import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';

export interface StorageDriver {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  createReadStream(key: string): fs.ReadStream;
  exists(key: string): boolean;
  remove(key: string): Promise<void>;
  /** 删掉文件后顺手清掉因此变空的目录（最多向上清到根），避免留下一堆空壳 */
  pruneEmptyDirs(key: string): Promise<void>;
  stat(key: string): fs.Stats;
  /** 供导出打包等需要真实文件路径的场景 */
  resolve(key: string): string;
}

/** 键路径安全：禁止绝对路径与 .. 穿越。 */
export function assertSafeKey(key: string): string {
  const normalized = path.normalize(key).replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('../')) {
    throw new Error(`非法的存储键: ${key}`);
  }
  return normalized;
}

export class LocalDriver implements StorageDriver {
  private root: string;

  constructor(root: string = paths.uploads) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  resolve(key: string): string {
    const safe = assertSafeKey(key);
    const full = path.resolve(this.root, safe);
    if (!full.startsWith(this.root)) throw new Error('越界访问');
    return full;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
  }

  async read(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolve(key));
  }

  createReadStream(key: string): fs.ReadStream {
    return fs.createReadStream(this.resolve(key));
  }

  exists(key: string): boolean {
    return fs.existsSync(this.resolve(key));
  }

  stat(key: string): fs.Stats {
    return fs.statSync(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolve(key));
    } catch {
      /* 文件已不存在时忽略 */
    }
  }

  async pruneEmptyDirs(key: string): Promise<void> {
    let dir = path.dirname(this.resolve(key));
    while (dir.startsWith(this.root) && dir !== this.root) {
      try {
        if ((await fs.promises.readdir(dir)).length > 0) return;
        await fs.promises.rmdir(dir);
      } catch {
        return;
      }
      dir = path.dirname(dir);
    }
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) driver = new LocalDriver();
  return driver;
}

export function setStorage(next: StorageDriver): void {
  driver = next;
}
