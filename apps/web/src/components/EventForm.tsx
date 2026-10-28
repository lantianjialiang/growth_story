import { useEffect, useRef, useState } from 'react';
import {
  EVENT_TYPES,
  eventTypeLabel,
  isBuiltinEventType,
  type DatePrecision,
  type EventDTO,
  type MediaDTO,
} from '@growth/shared';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { todayCalendar } from '../lib/format';
import { byteText, editImage } from '../lib/imageFile';
import {
  useCreateEvent,
  useCreateEventType,
  useDeleteMedia,
  useEventTypes,
  useProfileTags,
  useRotateMedia,
  useUpdateEvent,
  useUploadMedia,
} from '../lib/queries';
import { useToast } from './toast';
import { Button, Field, Modal, Spinner } from './ui';
import { DateField } from './DateField';
import { MediaUploader } from './MediaUploader';
import { TagInput } from './TagInput';

const TYPE_TONE: Record<string, string> = {
  milestone: 'bg-accent-soft text-accent',
  birthday: 'bg-amber-soft text-[#8a6a2c]',
  health: 'bg-olive-soft text-olive',
  travel: 'bg-[#e8eef4] text-[#3d5f7a]',
  school: 'bg-[#efe9f4] text-[#6b5285]',
  daily: 'bg-paper-deep text-ink-soft',
  other: 'bg-paper-deep text-muted',
};

/** 自定义类型没有预设色，按名称稳定地散列到一个柔和色调上。 */
const CUSTOM_TONES = [
  'bg-accent-soft text-accent',
  'bg-amber-soft text-[#8a6a2c]',
  'bg-olive-soft text-olive',
  'bg-[#e8eef4] text-[#3d5f7a]',
  'bg-[#efe9f4] text-[#6b5285]',
  'bg-[#eef1ea] text-[#5b6a4c]',
];

export function typeClass(type: string): string {
  if (isBuiltinEventType(type)) return TYPE_TONE[type] ?? CUSTOM_TONES[0]!;
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) hash = (hash * 31 + type.charCodeAt(i)) % 997;
  return CUSTOM_TONES[hash % CUSTOM_TONES.length]!;
}

const MAX_PICKED = 20;

interface Pick {
  key: string;
  /** 用户选的原文件：旋转 / 重新压缩都以它为基准，反复操作不掉画质 */
  original: File;
  file: File;
  preview: string;
  rotate: number;
  beforeBytes: number;
  afterBytes: number;
  compressed: boolean;
  processing: boolean;
}

let pickSeq = 0;

/**
 * 新建事件时的照片选择区：本地文件先预览，保存事件后再上传。
 * 选好就能转方向、看到压缩结果，保存前就知道这条记录长什么样。
 */
function PickedPhotos({
  onChange,
  disabled,
}: {
  onChange: (next: File[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const objectUrls = useRef(new Set<string>());

  // 预览用的 objectURL 统一回收，避免长时间编辑时泄漏
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    onChange(picks.map((pick) => pick.file));
  }, [picks, onChange]);

  const track = (file: Blob) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  };

  const untrack = (url: string) => {
    if (objectUrls.current.delete(url)) URL.revokeObjectURL(url);
  };

  const patch = (key: string, next: Partial<Pick>) => {
    setPicks((prev) => prev.map((pick) => (pick.key === key ? { ...pick, ...next } : pick)));
  };

  const add = async (list: File[]) => {
    const images = list.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    const room = Math.max(0, MAX_PICKED - picks.length);
    const accepted = images.slice(0, room);
    if (accepted.length === 0) return;

    const created: Pick[] = accepted.map((file) => {
      pickSeq += 1;
      return {
        key: `pick-${pickSeq}`,
        original: file,
        file,
        preview: track(file),
        rotate: 0,
        beforeBytes: file.size,
        afterBytes: file.size,
        compressed: false,
        processing: true,
      };
    });
    setPicks((prev) => [...prev, ...created]);

    // 逐张处理：大图缩到长边 3200 以内，小图直接过
    for (const pick of created) {
      try {
        const result = await editImage(pick.original, { shrink: true });
        if (result.skipped) {
          patch(pick.key, { processing: false });
          continue;
        }
        const preview = track(result.file);
        untrack(pick.preview);
        patch(pick.key, {
          file: result.file,
          preview,
          compressed: result.compressed,
          afterBytes: result.afterBytes,
          processing: false,
        });
      } catch {
        patch(pick.key, { processing: false });
      }
    }
  };

  const rotate = async (pick: Pick, delta: number) => {
    if (pick.processing) return;
    const target = (((pick.rotate + delta) % 360) + 360) % 360;
    patch(pick.key, { processing: true });
    try {
      const result = await editImage(pick.original, { rotate: target, shrink: true });
      const preview = track(result.file);
      untrack(pick.preview);
      patch(pick.key, {
        file: result.file,
        preview,
        rotate: target,
        compressed: result.compressed,
        afterBytes: result.afterBytes,
        processing: false,
      });
    } catch {
      patch(pick.key, { processing: false });
    }
  };

  const remove = (key: string) => {
    setPicks((prev) => {
      const target = prev.find((pick) => pick.key === key);
      if (target) untrack(target.preview);
      return prev.filter((pick) => pick.key !== key);
    });
  };

  const clear = () => {
    setPicks((prev) => {
      for (const pick of prev) untrack(pick.preview);
      return [];
    });
  };

  const compressedCount = picks.filter((pick) => pick.compressed).length;
  const savedBytes = picks.reduce(
    (sum, pick) => sum + Math.max(0, pick.beforeBytes - pick.afterBytes),
    0,
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void add(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-2xl border border-dashed p-2 transition-colors ${
        dragging ? 'border-accent bg-accent-soft/50' : 'border-line-strong bg-surface/50'
      }`}
    >
      {picks.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-7 text-center transition-colors hover:bg-accent-soft/25"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent/70" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8.5" cy="10" r="1.4" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M4 17l4.5-4.5 3.5 3 3-2.5L20 17"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-sm text-ink-soft">{t('event.addPhotos')}</span>
          <span className="text-[11px] text-muted">{t('event.photos.hint')}</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {picks.map((pick) => (
            <div
              key={pick.key}
              className="group relative aspect-square overflow-hidden rounded-xl bg-paper-deep"
            >
              <img src={pick.preview} alt={pick.file.name} className="h-full w-full object-cover" />

              <div className="absolute top-1 left-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => void rotate(pick, -90)}
                  disabled={pick.processing}
                  aria-label={t('event.photos.rotateLeft')}
                  title={t('event.photos.rotateLeft')}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-[13px] leading-none text-ink/75 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
                >
                  ↺
                </button>
                <button
                  type="button"
                  onClick={() => void rotate(pick, 90)}
                  disabled={pick.processing}
                  aria-label={t('event.photos.rotateRight')}
                  title={t('event.photos.rotateRight')}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-[13px] leading-none text-ink/75 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
                >
                  ↻
                </button>
              </div>

              <button
                type="button"
                onClick={() => remove(pick.key)}
                aria-label={t('event.photos.remove')}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-[11px] text-white/90 backdrop-blur-sm hover:bg-ink/80"
              >
                ×
              </button>

              {pick.processing ? (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/35 backdrop-blur-[1px]">
                  <Spinner className="h-4 w-4 text-white" />
                </span>
              ) : null}

              {pick.compressed && !pick.processing ? (
                <span className="absolute bottom-6 left-1 rounded-full bg-olive/85 px-1.5 py-0.5 text-[9px] text-white">
                  {t('event.photos.compressedBadge', {
                    saved: Math.round((1 - pick.afterBytes / Math.max(1, pick.beforeBytes)) * 100),
                  })}
                </span>
              ) : null}

              <span className="absolute inset-x-0 bottom-0 truncate bg-ink/45 px-1.5 py-0.5 text-[10px] text-white/85">
                {pick.file.name}
              </span>
            </div>
          ))}
          {picks.length < MAX_PICKED ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-muted transition-colors hover:border-accent/60 hover:text-accent"
            >
              <span className="text-lg leading-none">＋</span>
              <span className="text-[10px]">{t('event.addPhotos')}</span>
            </button>
          ) : null}
        </div>
      )}

      {picks.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-[11px] text-muted">
          <span>
            {t('event.photos.pending', { n: picks.length })}
            {compressedCount > 0 ? (
              <span className="text-olive">
                {' · '}
                {t('event.photos.compressedCount', {
                  n: compressedCount,
                  size: byteText(savedBytes),
                })}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-3">
            <span className="hidden sm:inline">{t('event.photos.autoCompress')}</span>
            <button type="button" onClick={clear} className="hover:text-accent">
              {t('event.photos.clear')}
            </button>
          </span>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void add(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

/** 编辑已有事件时：管理已上传的照片（删除 / 设封面），并支持继续追加。 */
function ExistingPhotos({
  event,
  onDelete,
  onSetCover,
  onRotate,
  busyMediaId,
}: {
  event: EventDTO;
  onDelete: (media: MediaDTO) => void;
  onSetCover: (media: MediaDTO) => void;
  onRotate: (media: MediaDTO, degrees: number) => void;
  busyMediaId: string | null;
}) {
  const { t } = useI18n();
  if (event.media.length === 0) {
    return <p className="text-xs text-muted">{t('event.photos.empty')}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {event.media.map((item) => {
        const isCover = event.coverMediaId === item.id;
        return (
          <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl bg-paper-deep">
            <img
              src={item.urls.thumb}
              alt={item.altText ?? event.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label={t('event.photos.remove')}
              disabled={busyMediaId === item.id}
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-[11px] text-white/90 backdrop-blur-sm hover:bg-ink/80 disabled:opacity-50"
            >
              {busyMediaId === item.id ? <Spinner className="h-2.5 w-2.5" /> : '×'}
            </button>

            {/* 已上传的照片也能转方向：服务端从原图重新生成各尺寸 */}
            <div className="absolute top-1 left-1 flex gap-1">
              <button
                type="button"
                onClick={() => onRotate(item, -90)}
                disabled={busyMediaId === item.id}
                aria-label={t('event.photos.rotateLeft')}
                title={t('event.photos.rotateLeft')}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-[13px] leading-none text-ink/75 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => onRotate(item, 90)}
                disabled={busyMediaId === item.id}
                aria-label={t('event.photos.rotateRight')}
                title={t('event.photos.rotateRight')}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-[13px] leading-none text-ink/75 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
              >
                ↻
              </button>
            </div>

            {busyMediaId === item.id ? (
              <span className="absolute inset-0 flex items-center justify-center bg-ink/25">
                <Spinner className="h-4 w-4 text-white" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onSetCover(item)}
              disabled={isCover}
              className={`absolute inset-x-0 bottom-0 truncate px-1.5 py-1 text-[10px] backdrop-blur-sm transition-colors ${
                isCover
                  ? 'bg-accent/85 text-white'
                  : 'bg-ink/45 text-white/85 hover:bg-ink/70'
              }`}
            >
              {isCover ? t('event.coverBadge') : t('event.setCover')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function EventForm({
  open,
  onClose,
  profileId,
  event,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  event?: EventDTO | null;
  defaultDate?: string;
  onSaved?: (event: EventDTO) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const createEvent = useCreateEvent(profileId);
  const updateEvent = useUpdateEvent(profileId);
  const uploadMedia = useUploadMedia(profileId);
  const deleteMedia = useDeleteMedia(profileId);
  const rotateMedia = useRotateMedia(profileId);
  const eventTypes = useEventTypes(profileId);
  const createType = useCreateEventType(profileId);
  const profileTags = useProfileTags(profileId);

  const editing = Boolean(event);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string>(todayCalendar());
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [type, setType] = useState<string>('daily');
  const [newType, setNewType] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);

  // 只在切换到另一条记录时重置表单：事件被刷新（例如刚上传了照片）不应覆盖用户正在输入的内容
  const editingId = event?.id;
  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? '');
    setDate(event?.date ?? defaultDate ?? todayCalendar());
    setPrecision(event?.datePrecision ?? 'day');
    setType(event?.type ?? 'daily');
    setBody(event?.body ?? '');
    setPlace(event?.placeText ?? '');
    setTags([...(event?.tags ?? [])]);
    setIsPrivate(event?.visibility === 'private');
    setFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, defaultDate]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error(t('event.field.title'));
      return;
    }
    const cleanTags = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);

    setBusy(true);
    try {
      if (editing && event) {
        const result = await updateEvent.mutateAsync({
          eventId: event.id,
          input: {
            title: title.trim(),
            date,
            datePrecision: precision,
            type,
            body: body.trim() ? body : null,
            placeText: place.trim() ? place.trim() : null,
            tags: cleanTags,
            visibility: isPrivate ? 'private' : 'inherit',
          },
        });
        onSaved?.(result.event);
      } else {
        const result = await createEvent.mutateAsync({
          title: title.trim(),
          date,
          datePrecision: precision,
          type,
          body: body.trim() ? body : null,
          placeText: place.trim() ? place.trim() : null,
          tags: cleanTags,
          visibility: isPrivate ? 'private' : 'inherit',
        } as never);
        if (files.length > 0) {
          const uploaded = await uploadMedia.mutateAsync({ files, eventId: result.event.id });
          if (uploaded.skipped.length > 0) {
            toast.error(uploaded.skipped.map((s) => `${s.name}：${s.reason}`).join('；'));
          }
        }
        onSaved?.(result.event);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (media: MediaDTO) => {
    setBusyMediaId(media.id);
    try {
      await deleteMedia.mutateAsync(media.id);
      toast.success(t('event.photos.remove'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyMediaId(null);
    }
  };

  const rotatePhoto = async (media: MediaDTO, degrees: number) => {
    setBusyMediaId(media.id);
    try {
      await rotateMedia.mutateAsync({ mediaId: media.id, degrees });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyMediaId(null);
    }
  };

  /** 在记录表单里直接新建类型，保存后立刻选中它 */
  const submitNewType = async () => {
    const label = (newType ?? '').trim();
    if (!label) return;
    try {
      const result = await createType.mutateAsync(label);
      setType(result.item.type);
      setNewType(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setCover = async (media: MediaDTO) => {
    if (!event) return;
    setBusyMediaId(media.id);
    try {
      await updateEvent.mutateAsync({ eventId: event.id, input: { coverMediaId: media.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyMediaId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('event.edit') : t('event.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('event.field.title')} required htmlFor="event-title">
        <input
          id="event-title"
          className="input font-serif text-base"
          value={title}
          maxLength={120}
          placeholder={t('event.placeholder.title')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <DateField
        label={t('event.field.date')}
        date={date}
        precision={precision}
        onChange={(d, p) => {
          if (d) setDate(d);
          setPrecision(p);
        }}
      />

      <Field label={t('event.field.type')}>
        <div className="flex flex-wrap gap-1.5">
          {(eventTypes.data?.items ?? EVENT_TYPES.map((item) => ({ type: item }))).map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => setType(item.type)}
              className={`chip ${type === item.type ? 'chip-active' : 'bg-surface hover:border-line-strong'}`}
            >
              {eventTypeLabel(item.type, t)}
            </button>
          ))}

          {newType === null ? (
            <button
              type="button"
              onClick={() => setNewType('')}
              className="chip border-dashed border-accent/60 bg-surface text-accent hover:bg-accent-soft/40"
            >
              ＋ {t('event.type.add')}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-accent/60 bg-surface py-0.5 pr-1 pl-2.5">
              <input
                autoFocus
                value={newType}
                maxLength={24}
                placeholder={t('event.type.addPlaceholder')}
                aria-label={t('event.type.add')}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitNewType();
                  }
                  if (e.key === 'Escape') setNewType(null);
                }}
                className="w-40 bg-transparent text-xs text-ink outline-none placeholder:text-muted/70"
              />
              <button
                type="button"
                onClick={() => void submitNewType()}
                disabled={createType.isPending || !newType.trim()}
                className="rounded-full bg-accent px-2 py-1 text-[11px] text-white disabled:opacity-50"
              >
                {t('event.type.addSubmit')}
              </button>
              <button
                type="button"
                onClick={() => setNewType(null)}
                className="px-1 text-xs text-muted hover:text-ink"
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </span>
          )}
        </div>
      </Field>

      <Field label={t('event.field.body')}>
        <textarea
          className="input min-h-32 resize-y leading-relaxed"
          value={body}
          maxLength={20000}
          placeholder={t('event.placeholder.body')}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label={t('event.field.place')}>
          <input
            className="input"
            value={place}
            maxLength={200}
            onChange={(e) => setPlace(e.target.value)}
          />
        </Field>
        <Field label={t('event.field.tags')} hint={t('event.field.tagsHint')}>
          <TagInput
            value={tags}
            onChange={setTags}
            suggestions={profileTags.data?.items ?? []}
            placeholder={t('event.placeholder.tags')}
          />
        </Field>
      </div>

      <label className="mt-1 mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span>
          <span className="block text-ink-soft">{t('event.visibility.private')}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {isPrivate ? t('event.field.visibility') : t('event.visibility.inherit')}
          </span>
        </span>
      </label>

      <Field
        label={t('event.field.photos')}
        hint={editing ? t('event.photos.more') : undefined}
      >
        {editing && event ? (
          <div className="space-y-3">
            <ExistingPhotos
              event={event}
              onDelete={(media) => void removePhoto(media)}
              onSetCover={(media) => void setCover(media)}
              onRotate={(media, degrees) => void rotatePhoto(media, degrees)}
              busyMediaId={busyMediaId}
            />
            <MediaUploader profileId={profileId} eventId={event.id} compact />
          </div>
        ) : (
          <PickedPhotos onChange={setFiles} disabled={busy} />
        )}
      </Field>
    </Modal>
  );
}
