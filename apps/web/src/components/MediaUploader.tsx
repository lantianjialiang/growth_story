import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { useUploadMedia } from '../lib/queries';
import { byteText, shrinkForUpload } from '../lib/imageFile';
import { useToast } from './toast';
import { Spinner } from './ui';

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';

interface QueueItem {
  key: string;
  file: File;
  status: ItemStatus;
  error?: string;
  /** 压缩结果，例如「5.2MB → 1.8MB」 */
  note?: string;
}

const CONCURRENCY = 3;

export function MediaUploader({
  profileId,
  eventId,
  compact = false,
  onDone,
}: {
  profileId: string;
  eventId?: string | null;
  compact?: boolean;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const upload = useUploadMedia(profileId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const running = useRef(false);

  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setPreparing((prev) => prev + images.length);
    // 大图先在本地压一遍再上传：上行更快，存储也省；小图原样送。
    // 逐个入队（而不是全压完再传），第一张准备好就能开始上传，边压边传。
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const file = images[index];
        if (!file) return;
        let target = file;
        let note: string | undefined;
        try {
          const result = await shrinkForUpload(file);
          target = result.file;
          if (result.compressed) {
            note = `${byteText(result.beforeBytes)} → ${byteText(result.afterBytes)}`;
          }
        } catch {
          /* 压缩失败就按原文件传，服务端还会再处理一遍 */
        }
        setItems((prev) => [
          ...prev,
          {
            key: `${target.name}-${target.size}-${Date.now()}-${index}`,
            file: target,
            status: 'pending',
            note,
          },
        ]);
        setPreparing((prev) => Math.max(0, prev - 1));
      }
    };
    // 同时压两张：再多人会抢占内存，反而更慢
    await Promise.all(Array.from({ length: Math.min(2, images.length) }, worker));
  }, []);

  // 串行批处理：每次最多 3 个文件，失败可单条重试
  useEffect(() => {
    if (running.current) return;
    const batch = items.filter((i) => i.status === 'pending').slice(0, CONCURRENCY);
    if (batch.length === 0) return;

    running.current = true;
    const keys = new Set(batch.map((b) => b.key));
    setItems((prev) => prev.map((i) => (keys.has(i.key) ? { ...i, status: 'uploading' } : i)));

    upload
      .mutateAsync({ files: batch.map((b) => b.file), eventId })
      .then((result) => {
        // 跳过（重复 / 格式不支持）的文件已单独提示，这里统一标记为完成
        setItems((prev) =>
          prev.map((i) => (keys.has(i.key) ? { ...i, status: 'done' } : i)),
        );
        if (result.skipped.length > 0) {
          toast.error(result.skipped.map((s) => `${s.name}：${s.reason}`).join('；'));
        }
        onDone?.();
      })
      .catch((err: unknown) => {
        const message = errorMessage(err);
        setItems((prev) =>
          prev.map((i) => (keys.has(i.key) ? { ...i, status: 'error', error: message } : i)),
        );
        toast.error(message);
      })
      .finally(() => {
        running.current = false;
      });
  }, [items, upload, eventId, onDone, toast]);

  const retry = (key: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'pending' } : i)));
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition-colors ${
          dragging
            ? 'border-accent bg-accent-soft/60'
            : 'border-line-strong bg-surface/60 hover:border-accent/60 hover:bg-accent-soft/30'
        } ${compact ? 'py-5' : 'py-9'}`}
      >
        <svg viewBox="0 0 24 24" className="mb-2 h-6 w-6 text-accent/70" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8.5" cy="10" r="1.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4 17l4.5-4.5 3.5 3 3-2.5L20 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-ink-soft">{t('event.dragHint')}</p>
        <p className="mt-1 text-xs text-muted">
          {preparing > 0 ? t('event.photos.preparing', { n: preparing }) : t('event.uploadLimits')}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {total > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {done === total ? '全部完成' : t('event.uploading', { done, total })}
            </span>
            <button
              type="button"
              className="hover:text-accent"
              onClick={() => setItems((prev) => prev.filter((i) => i.status !== 'done'))}
            >
              清除已完成
            </button>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-paper-deep">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
            />
          </div>
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-paper-deep/60 px-2.5 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {item.status === 'uploading' ? <Spinner className="h-3 w-3 text-accent" /> : null}
                  <span className="truncate text-ink-soft">{item.file.name}</span>
                  {item.note ? (
                    <span className="shrink-0 text-[10px] text-olive">{item.note}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.status === 'done' ? <span className="text-olive">✓</span> : null}
                  {item.status === 'error' ? (
                    <>
                      <span className="text-red-600">{item.error ?? '失败'}</span>
                      <button type="button" className="text-accent hover:underline" onClick={() => retry(item.key)}>
                        {t('common.retry')}
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
