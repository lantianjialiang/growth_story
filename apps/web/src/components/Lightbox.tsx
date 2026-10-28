import { useEffect, useRef, useState } from 'react';
import type { MediaDTO } from '@growth/shared';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: MediaDTO[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const { t } = useI18n();
  const open = index !== null && images.length > 0;
  const current = open ? images[Math.min(index!, images.length - 1)] : null;
  const touchStart = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index! < images.length - 1) onIndexChange(index! + 1);
      if (e.key === 'ArrowLeft' && index! > 0) onIndexChange(index! - 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, index, images.length, onClose, onIndexChange]);

  if (!open || !current) return null;

  const go = (delta: number) => {
    const next = index! + delta;
    if (next >= 0 && next < images.length) onIndexChange(next);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-ink/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('event.photos')}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        if (start !== null && end !== null && Math.abs(end - start) > 50) {
          go(end < start ? 1 : -1);
        }
        touchStart.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-xs tracking-wide">
          {index! + 1} / {images.length}
          {current.takenAt ? ` · ${current.takenAt.slice(0, 10)}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={current.urls.original}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-3 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            {t('common.none') === '无' ? '原图' : 'Original'}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
          </div>
        ) : null}
        <img
          key={current.id}
          src={current.urls.medium}
          alt={current.altText ?? ''}
          onLoad={() => setLoaded(true)}
          className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />

        {index! > 0 ? (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/30 px-3 py-2 text-white/90 hover:bg-black/50"
            aria-label={t('event.prev')}
          >
            ‹
          </button>
        ) : null}
        {index! < images.length - 1 ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/30 px-3 py-2 text-white/90 hover:bg-black/50"
            aria-label={t('event.next')}
          >
            ›
          </button>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-md ring-2 transition ${
                i === index ? 'ring-white/90' : 'ring-transparent opacity-60 hover:opacity-100'
              }`}
              aria-label={`${i + 1}`}
            >
              <img src={image.urls.thumb} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>,
    document.body,
  );
}
