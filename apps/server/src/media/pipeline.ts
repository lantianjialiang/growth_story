import crypto from 'node:crypto';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import type { StorageDriver } from '../storage/index.js';

export interface ImageVariantSet {
  thumb: string;
  medium: string;
}

export interface ProcessedImage {
  sha256: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  originalKey: string;
  variants: ImageVariantSet;
  takenAt: string | null;
  takenTzOffset: string | null;
}

const SUPPORTED: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
  avif: { mime: 'image/avif', ext: 'avif' },
};

/** 按文件头识别图片类型（不信任扩展名与 Content-Type）。 */
export function detectImageType(buffer: Buffer): { mime: string; ext: string; format: string } | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ...SUPPORTED.jpeg!, format: 'jpeg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ...SUPPORTED.png!, format: 'png' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { ...SUPPORTED.gif!, format: 'gif' };
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ...SUPPORTED.webp!, format: 'webp' };
  }
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return { ...SUPPORTED.avif!, format: 'avif' };
  }
  return null;
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 解析 EXIF 原始时间字符串（'2024:03:05 10:22:31'），不经过 Date，避免时区漂移。 */
function parseExifTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

export async function readExif(buffer: Buffer): Promise<{ takenAt: string | null; tzOffset: string | null }> {
  try {
    const raw = (await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
    if (!raw) return { takenAt: null, tzOffset: null };
    const takenAt =
      parseExifTime(raw.DateTimeOriginal) ?? parseExifTime(raw.CreateDate) ?? null;
    const tzRaw = raw.OffsetTimeOriginal ?? raw.OffsetTime;
    const tzOffset = typeof tzRaw === 'string' && /^[+-]\d{2}:\d{2}$/.test(tzRaw) ? tzRaw : null;
    return { takenAt, tzOffset };
  } catch {
    return { takenAt: null, tzOffset: null };
  }
}

// ---------- 落盘路径 ----------

/** Windows 不允许出现在文件名里的字符，顺带把控制字符一起清掉。 */
const UNSAFE_PATH_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
/** Windows 保留名，目录叫 CON 这种会直接写不进去。 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]{1,8}$/, '');
}

/**
 * 把任意文案变成可读的目录 / 文件片段：保留中英文与数字，空格换成连字符，
 * 去掉路径非法字符，截断到 max 个字符（避免路径过长）。
 */
export function slugifyName(value: string, max = 40): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(UNSAFE_PATH_CHARS, ' ')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max)
    .replace(/[-.]+$/g, '');
  if (!cleaned) return '';
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

export interface MediaKeyPrefixInput {
  profileName: string;
  profileId: string;
  mediaId: string;
  /** 上传时的原始文件名，用来让目录一眼看出是哪张照片 */
  fileName?: string | null;
  /** 上传时间，用于按年月分目录；默认现在 */
  uploadedAt?: Date;
}

/**
 * 图片落盘目录：`<档案名>-<档案id8>/<YYYY-MM>/<原文件名>-<媒体id8>`。
 *
 * 例：`小满-77bde782/2026-10/IMG_2041-04bae623/original.jpg`
 * 目录名是「快照」——档案改名后旧目录不会跟着变，数据库里存的是完整路径。
 */
export function buildMediaKeyPrefix(input: MediaKeyPrefixInput): string {
  const at = input.uploadedAt ?? new Date();
  const profileSlug = slugifyName(input.profileName, 40) || 'profile';
  const profileTag = `${profileSlug}-${input.profileId.slice(0, 8)}`;
  const month = `${at.getFullYear()}-${pad(at.getMonth() + 1)}`;
  const stem = slugifyName(stripExtension(input.fileName ?? ''), 32) || 'photo';
  return `${profileTag}/${month}/${stem}-${input.mediaId.slice(0, 8)}`;
}

/** 从已有 key 里取出目录部分（旋转等原地重写时用）。 */
export function dirnameOfKey(key: string): string {
  const dir = path.posix.dirname(key.replaceAll('\\', '/'));
  return dir === '.' ? '' : dir;
}

// ---------- 图片处理 ----------

export type ProcessImageOptions =
  | { storage: StorageDriver; keyPrefix: string }
  | { storage: StorageDriver; keyInput: MediaKeyPrefixInput };

/**
 * 完整处理流水线：识别类型 → 读 EXIF 时间 → 去除全部元数据并生成多尺寸 WebP。
 * 原图会以"方向已摆正 + 元数据已清空"的形式保存，GPS 不会落盘。
 *
 * 性能：源图只解码一次，用 clone() 派生原图 / 缩略图 / 中图三份并行编码，
 * 比每份都从 Buffer 重新解码快一倍以上。
 */
export async function processImage(
  buffer: Buffer,
  options: ProcessImageOptions,
): Promise<ProcessedImage> {
  const detected = detectImageType(buffer);
  if (!detected) {
    throw Object.assign(new Error('不支持的图片格式'), { code: 'unsupported_media_type' });
  }

  const [{ takenAt, tzOffset }, meta] = await Promise.all([
    readExif(buffer),
    sharp(buffer, { animated: false, failOn: 'none' }).metadata(),
  ]);

  const orientation = meta.orientation ?? 1;
  const swap = orientation >= 5 && orientation <= 8;
  const width = swap ? (meta.height ?? null) : (meta.width ?? null);
  const height = swap ? (meta.width ?? null) : (meta.height ?? null);

  // 摆正方向只做一次，三份输出都从这一份 pipeline 克隆
  const source = sharp(buffer, { animated: false, failOn: 'none' }).rotate();

  // 浏览器上传的图片已经在本地摆正、重编码过（没有 EXIF/XMP/ICC），
  // 再编码一遍只会更慢、画质更差——直接留用原始字节。
  const alreadyClean =
    orientation === 1 &&
    !meta.exif &&
    !meta.xmp &&
    !meta.iptc &&
    !meta.icc &&
    detected.format !== 'gif';

  const [original, thumb, medium] = await Promise.all([
    alreadyClean
      ? Promise.resolve({ buffer, mime: detected.mime })
      : encodeOriginal(source.clone(), detected.format),
    source
      .clone()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76, effort: 3 })
      .toBuffer(),
    source
      .clone()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 3 })
      .toBuffer(),
  ]);

  const base =
    'keyPrefix' in options
      ? options.keyPrefix.replace(/\/+$/, '')
      : buildMediaKeyPrefix({
          ...options.keyInput,
          // 有拍摄时间就按拍摄年月归档，比按上传时间更符合"这是哪段日子"的直觉
          uploadedAt: takenAt ? new Date(takenAt) : options.keyInput.uploadedAt,
        });
  const originalKey = `${base}/original.${detected.ext}`;
  const thumbKey = `${base}/thumb.webp`;
  const mediumKey = `${base}/medium.webp`;

  await Promise.all([
    options.storage.write(originalKey, original.buffer),
    options.storage.write(thumbKey, thumb),
    options.storage.write(mediumKey, medium),
  ]);

  return {
    sha256: sha256(buffer),
    mime: original.mime ?? detected.mime,
    sizeBytes: original.buffer.length,
    width,
    height,
    originalKey,
    variants: { thumb: thumbKey, medium: mediumKey },
    takenAt,
    takenTzOffset: tzOffset,
  };
}

/**
 * 原图重编码：去元数据、摆正，质量和速度取平衡。
 * mozjpeg 体积略小但要慢一倍，这里用普通编码 + 88 质量。
 */
async function encodeOriginal(
  image: sharp.Sharp,
  format: string,
): Promise<{ buffer: Buffer; mime: string }> {
  switch (format) {
    case 'png':
      return {
        buffer: await image.png({ compressionLevel: 6, adaptiveFiltering: false }).toBuffer(),
        mime: 'image/png',
      };
    case 'webp':
      return { buffer: await image.webp({ quality: 90, effort: 3 }).toBuffer(), mime: 'image/webp' };
    case 'avif':
      return {
        buffer: await image.avif({ quality: 60, effort: 3 }).toBuffer(),
        mime: 'image/avif',
      };
    case 'gif':
      return { buffer: await image.gif().toBuffer(), mime: 'image/gif' };
    case 'jpeg':
    default:
      return {
        buffer: await image.jpeg({ quality: 88, chromaSubsampling: '4:2:0' }).toBuffer(),
        mime: 'image/jpeg',
      };
  }
}

/** 把已存的原图按角度旋转（顺时针，负数向左），重新编码但保持原格式。 */
export async function rotateBuffer(buffer: Buffer, degrees: number): Promise<Buffer> {
  const detected = detectImageType(buffer);
  const image = sharp(buffer, { failOn: 'none' }).rotate(degrees);
  switch (detected?.format) {
    case 'png':
      return image.png({ compressionLevel: 6, adaptiveFiltering: false }).toBuffer();
    case 'webp':
      return image.webp({ quality: 92, effort: 3 }).toBuffer();
    case 'avif':
      return image.avif({ quality: 62, effort: 3 }).toBuffer();
    case 'gif':
      return image.gif().toBuffer();
    case 'jpeg':
    default:
      return image.jpeg({ quality: 92, chromaSubsampling: '4:2:0' }).toBuffer();
  }
}

export function calendarDateOf(takenAt: string | null): string | null {
  if (!takenAt) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(takenAt);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export { pad };
