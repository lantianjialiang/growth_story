/**
 * 上传前的本地图片处理：旋转 + 压缩。
 * 全部在浏览器里用 canvas 完成，服务端只负责再生成多尺寸；对用户来说
 * "选好就能立刻看到转过来的样子"，大图也不会把上行带宽和存储吃掉。
 */

/** 长边超过这个值就缩一缩；3200 足够留住细节，又能把手机原图压到 1/3 以内 */
const MAX_EDGE = 3200;
/** 小于这个体积不折腾，重编码反而可能变大 */
const SHRINK_THRESHOLD = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.86;
const WEBP_QUALITY = 0.88;

const PROCESSABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface ImageEditOptions {
  /** 顺时针旋转角度，只支持 0 / 90 / 180 / 270 */
  rotate?: number;
  /** 是否把过大的图缩到 MAX_EDGE 以内 */
  shrink?: boolean;
}

export interface ImageEditResult {
  file: File;
  rotated: number;
  /** 是否真的做了压缩（体积变小） */
  compressed: boolean;
  beforeBytes: number;
  afterBytes: number;
  skipped: boolean;
}

export function isProcessable(file: File): boolean {
  return PROCESSABLE.has(file.type);
}

async function bitmapOf(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 某些格式 / 浏览器不支持该选项，退回普通解码 */
      try {
        return await createImageBitmap(file);
      } catch {
        /* 继续走 <img> 兜底 */
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // 解码完成后即可释放；img 已经持有像素数据
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in source && source.naturalWidth > 0) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function outputMimeFor(file: File): { mime: string; quality?: number } | null {
  switch (file.type) {
    case 'image/jpeg':
      return { mime: 'image/jpeg', quality: JPEG_QUALITY };
    case 'image/webp':
      return { mime: 'image/webp', quality: WEBP_QUALITY };
    case 'image/png':
      return { mime: 'image/png' };
    case 'image/avif':
      // 浏览器基本不支持编码 AVIF，交给服务端去处理
      return null;
    default:
      return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
      mime,
      quality,
    );
  });
}

/** 把原文件按需旋转 / 缩放后重新编码，始终保持原文件名与扩展名。 */
export async function editImage(file: File, options: ImageEditOptions = {}): Promise<ImageEditResult> {
  const rotate = (((options.rotate ?? 0) % 360) + 360) % 360;
  const shrink = options.shrink ?? true;
  const untouched: ImageEditResult = {
    file,
    rotated: 0,
    compressed: false,
    beforeBytes: file.size,
    afterBytes: file.size,
    skipped: true,
  };

  if (!isProcessable(file)) return untouched;
  const target = outputMimeFor(file);
  if (!target) return untouched;
  // 没要求旋转、体积也不大：不动它
  if (rotate === 0 && (!shrink || file.size <= SHRINK_THRESHOLD)) return untouched;

  const source = await bitmapOf(file);
  const { width, height } = sizeOf(source);
  if (!width || !height) return untouched;

  const swapped = rotate === 90 || rotate === 270;
  const naturalWidth = swapped ? height : width;
  const naturalHeight = swapped ? width : height;
  const scale = shrink ? Math.min(1, MAX_EDGE / Math.max(naturalWidth, naturalHeight)) : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return untouched;
  ctx.imageSmoothingQuality = 'high';
  // PNG 可能有透明区域，底色留白比默认黑色更稳妥
  if (target.mime === 'image/png') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(
    source,
    (-width * scale) / 2,
    (-height * scale) / 2,
    width * scale,
    height * scale,
  );

  if ('close' in source && typeof source.close === 'function') source.close();

  const blob = await toBlob(canvas, target.mime, target.quality);
  // 旋转过就没有"保持原图"的选项；只压缩时若反而变大，就放弃压缩
  if (rotate === 0 && blob.size >= file.size) return untouched;

  return {
    file: new File([blob], file.name, { type: target.mime, lastModified: file.lastModified }),
    rotated: rotate,
    compressed: blob.size < file.size,
    beforeBytes: file.size,
    afterBytes: blob.size,
    skipped: false,
  };
}

/** 上传队列用：只压缩、不旋转。 */
export function shrinkForUpload(file: File): Promise<ImageEditResult> {
  return editImage(file, { shrink: true });
}

export function byteText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
