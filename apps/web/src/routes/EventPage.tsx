import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventTypeLabel } from '@growth/shared';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { ageText, dateText } from '../lib/format';
import {
  useDeleteEvent,
  useDeleteMedia,
  useEvent,
  useProfile,
  useUpdateEvent,
} from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { EventForm, typeClass } from '../components/EventForm';
import { Lightbox } from '../components/Lightbox';
import { MediaUploader } from '../components/MediaUploader';
import { useToast } from '../components/toast';
import { Button, ConfirmModal, EmptyState, SkeletonBlock } from '../components/ui';

export function EventPage() {
  const { profileId = '', eventId = '' } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const detail = useEvent(eventId);
  const profileQuery = useProfile(profileId);
  const updateEvent = useUpdateEvent(profileId);
  const deleteEvent = useDeleteEvent(profileId);
  const deleteMedia = useDeleteMedia(profileId);

  const [editing, setEditing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);

  const event = detail.data?.event;
  const profile = profileQuery.data?.profile;
  const role = profile?.role;
  const canEdit = role === 'owner' || role === 'editor';
  const birthDate = detail.data?.profile.birthDate ?? profile?.birthDate ?? null;
  const birthPrecision = (detail.data?.profile.birthPrecision ?? profile?.birthPrecision ?? 'day') as
    | 'day'
    | 'month'
    | 'year';
  const deathDate = detail.data?.profile.deathDate ?? profile?.deathDate ?? null;

  const age = event ? ageText(birthDate, birthPrecision, event.date, t, { deathDate }) : null;

  if (detail.isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <EmptyState
          title={t('error.notFound')}
          body="这条记录可能已被删除。"
          action={
            <Link to={`/p/${profileId}`} className="btn btn-outline">
              {t('common.back')}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const images = event.media;

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to={`/p/${profileId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span>
          {detail.data?.profile.name ?? t('common.back')}
        </Link>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
            <Button size="sm" variant="ghost" className="text-muted" onClick={() => setConfirmDelete(true)}>
              {t('common.delete')}
            </Button>
          </div>
        ) : null}
      </div>

      <article className="card overflow-hidden">
        <div className="px-5 pt-6 pb-5 sm:px-8 sm:pt-8">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <time dateTime={event.date} className="font-medium tracking-wide text-ink-soft">
              {dateText(event.date, event.datePrecision, lang)}
            </time>
            {age ? (
              <>
                <span className="text-line-strong">·</span>
                <span>{age}</span>
              </>
            ) : null}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${typeClass(event.type)}`}>
              {eventTypeLabel(event.type, t)}
            </span>
            {event.visibility === 'private' ? (
              <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] text-muted">
                {t('event.visibility.private')}
              </span>
            ) : null}
          </div>

          <h1 className="font-serif text-[26px] leading-tight text-ink sm:text-[30px]">{event.title}</h1>

          {event.placeText ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                <path
                  d="M8 14s4.5-4.1 4.5-7A4.5 4.5 0 0 0 3.5 7c0 2.9 4.5 7 4.5 7Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="8" cy="7" r="1.4" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              {event.placeText}
            </p>
          ) : null}

          {event.body ? <div className="prose-body mt-5">{event.body}</div> : null}

          {event.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {event.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/p/${profileId}?tag=${encodeURIComponent(tag)}`}
                  className="rounded-md bg-paper-deep px-2 py-1 text-[11px] text-muted hover:text-accent"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {images.length > 0 ? (
          <div className="border-t border-line px-2 pt-2 pb-2 sm:px-3 sm:pt-3">
            <div
              className={`grid gap-1.5 ${
                images.length === 1
                  ? 'grid-cols-1'
                  : images.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {images.map((image, index) => (
                <div key={image.id} className="group relative overflow-hidden rounded-xl bg-paper-deep">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className="block w-full"
                    style={
                      images.length === 1
                        ? { height: 'clamp(240px, 42vw, 520px)' }
                        : { aspectRatio: images.length === 2 ? '3 / 2' : '1 / 1' }
                    }
                    aria-label={image.altText ?? event.title}
                  >
                    <img
                      src={image.urls.thumb}
                      alt={image.altText ?? `${event.title} ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </button>
                  <div className="pointer-events-none absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {event.coverMediaId === image.id ? (
                      <span className="rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-white">
                        {t('event.coverBadge')}
                      </span>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className="pointer-events-auto rounded bg-ink/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-ink/80"
                        onClick={() =>
                          updateEvent.mutate(
                            { eventId: event.id, input: { coverMediaId: image.id } },
                            {
                              onSuccess: () => toast.success(t('event.setCover')),
                              onError: (err) => toast.error(errorMessage(err)),
                            },
                          )
                        }
                      >
                        {t('event.setCover')}
                      </button>
                    ) : (
                      <span />
                    )}
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={t('common.delete')}
                        className="pointer-events-auto rounded bg-ink/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600/80"
                        onClick={() => setConfirmPhoto(image.id)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {canEdit ? (
          <div className="border-t border-line px-5 py-4 sm:px-8">
            {addingPhotos ? (
              <MediaUploader
                profileId={profileId}
                eventId={event.id}
                compact
                onDone={() => undefined}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingPhotos(true)}
                className="text-sm text-accent hover:underline"
              >
                ＋ {t('event.addPhotos')}
              </button>
            )}
          </div>
        ) : null}
      </article>

      <nav className="mt-6 flex items-center justify-between gap-3 text-sm">
        {detail.data?.neighbors.prevId ? (
          <Link
            to={`/p/${profileId}/e/${detail.data.neighbors.prevId}`}
            className="btn btn-outline btn-sm"
          >
            ← {t('event.prev')}
          </Link>
        ) : (
          <span />
        )}
        {detail.data?.neighbors.nextId ? (
          <Link
            to={`/p/${profileId}/e/${detail.data.neighbors.nextId}`}
            className="btn btn-outline btn-sm"
          >
            {t('event.next')} →
          </Link>
        ) : null}
      </nav>

      <EventForm
        open={editing}
        onClose={() => setEditing(false)}
        profileId={profileId}
        event={event}
      />

      {lightboxIndex !== null ? (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}

      <ConfirmModal
        open={confirmDelete}
        title={t('common.confirmDelete')}
        body={t('event.delete.confirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleteEvent.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteEvent.mutateAsync(event.id);
            toast.success('已移入回收站');
            navigate(`/p/${profileId}`);
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <ConfirmModal
        open={Boolean(confirmPhoto)}
        title={t('common.confirmDelete')}
        body={t('event.deletePhoto.confirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleteMedia.isPending}
        onCancel={() => setConfirmPhoto(null)}
        onConfirm={async () => {
          if (!confirmPhoto) return;
          try {
            await deleteMedia.mutateAsync(confirmPhoto);
            setConfirmPhoto(null);
            setLightboxIndex(null);
            toast.success('照片已移入回收站');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </AppShell>
  );
}
