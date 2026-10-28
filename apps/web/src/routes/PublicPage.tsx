import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  eventTypeLabel,
  type EventDTO,
  type ProfileDTO,
  type ProfileFacets,
  type TimelinePage,
} from '@growth/shared';
import { useI18n } from '../i18n';
import { api, qs } from '../lib/api';
import { ageText, dateText, todayCalendar } from '../lib/format';
import { AppShell } from '../components/AppShell';
import { EventCard } from '../components/EventCard';
import { typeClass } from '../components/EventForm';
import { Lightbox } from '../components/Lightbox';
import { Avatar, Button, EmptyState, SkeletonBlock } from '../components/ui';
import { ChipSelect } from '../components/ChipSelect';

interface PublicResponse extends TimelinePage {
  profile: ProfileDTO;
  share: { scope: 'profile' | 'event'; eventId: string | null };
}

interface PublicEventResponse {
  event: EventDTO;
  profile: { id: string; name: string; birthDate: string | null; birthPrecision: string; deathDate: string | null };
}

export function PublicPage() {
  const { token = '', eventId } = useParams();
  const { t, lang } = useI18n();
  const [year, setYear] = useState<number | undefined>();
  const [type, setType] = useState<string | undefined>();
  const [lightbox, setLightbox] = useState<{ images: EventDTO['media']; index: number } | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ['public', token, year, type],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api.get<PublicResponse>(
        `/api/v1/public/${token}${qs({ year, type, cursor: pageParam || undefined, limit: 20 })}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(token) && !eventId,
    retry: 0,
  });

  const single = useQuery({
    queryKey: ['public-event', token, eventId],
    queryFn: () => api.get<PublicEventResponse>(`/api/v1/public/${token}/events/${eventId}`),
    enabled: Boolean(token) && Boolean(eventId),
    retry: 0,
  });

  const firstPage = feed.data?.pages[0];
  const profile = firstPage?.profile;
  const facets = useQuery({
    queryKey: ['public-facets', token, year, type],
    queryFn: () =>
      api.get<ProfileFacets>(`/api/v1/public/${token}/facets${qs({ year, type })}`),
    enabled: Boolean(token) && !eventId,
    retry: 0,
    placeholderData: keepPreviousData,
  });
  /** 年份后面的数字要跟着类型筛选走，否则点了类型数字还是全档的。 */
  const years = useMemo(() => {
    const base = firstPage?.years ?? [];
    if (!facets.data) return base;
    const counts = new Map(facets.data.years.map((item) => [item.year, item.eventCount]));
    return base
      .map((item) => ({ ...item, eventCount: counts.get(item.year) ?? 0 }))
      .filter((item) => item.eventCount > 0 || item.year === year);
  }, [firstPage?.years, facets.data, year]);
  const events = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );
  const grouped = useMemo(() => {
    const map = new Map<number, EventDTO[]>();
    for (const event of events) {
      const y = Number(event.date.slice(0, 4));
      const list = map.get(y) ?? [];
      list.push(event);
      map.set(y, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [events]);

  const failed = feed.isError || single.isError;

  if (failed) {
    return (
      <AppShell bare>
        <div className="mx-auto max-w-md pt-10">
          <EmptyState
            title={t('public.invalid.title')}
            body={t('public.invalid.body')}
            action={
              <Link to="/login" className="btn btn-outline">
                {t('public.goLogin')}
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const banner = (
    <div className="border-b border-line bg-olive-soft/60">
      <p className="mx-auto max-w-5xl px-4 py-1.5 text-center text-[11px] tracking-wide text-olive sm:px-6">
        {t('public.banner')}
      </p>
    </div>
  );

  // 单条记录详情
  if (eventId) {
    const data = single.data;
    return (
      <AppShell bare banner={banner}>
        {single.isLoading || !data ? (
          <SkeletonBlock className="h-64" />
        ) : (
          <>
            <Link to={`/s/${token}`} className="mb-4 inline-block text-sm text-muted hover:text-accent">
              ← {data.profile.name}
            </Link>
            <article className="card overflow-hidden">
              <div className="px-5 pt-6 pb-5 sm:px-8">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <time dateTime={data.event.date} className="font-medium text-ink-soft">
                    {dateText(data.event.date, data.event.datePrecision, lang)}
                  </time>
                  <span className="text-line-strong">·</span>
                  <span>
                    {ageText(
                      data.profile.birthDate,
                      data.profile.birthPrecision as 'day' | 'month' | 'year',
                      data.event.date,
                      t,
                      { deathDate: data.profile.deathDate },
                    )}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${typeClass(data.event.type)}`}>
                    {eventTypeLabel(data.event.type, t)}
                  </span>
                </div>
                <h1 className="font-serif text-[26px] leading-tight text-ink">{data.event.title}</h1>
                {data.event.body ? <div className="prose-body mt-4">{data.event.body}</div> : null}
              </div>
              {data.event.media.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 border-t border-line p-2 sm:grid-cols-3">
                  {data.event.media.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setLightbox({ images: data.event.media, index })}
                      className="aspect-square overflow-hidden rounded-lg bg-paper-deep"
                    >
                      <img
                        src={image.urls.thumb}
                        alt={image.altText ?? data.event.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          </>
        )}
        {lightbox ? (
          <Lightbox
            images={lightbox.images}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onIndexChange={(index) => setLightbox({ ...lightbox, index })}
          />
        ) : null}
      </AppShell>
    );
  }

  return (
    <AppShell bare banner={banner}>
      {feed.isLoading || !profile ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : (
        <>
          <section className="mb-6 flex items-start gap-4">
            <Avatar src={profile.avatarUrl} name={profile.name} kind={profile.kind} size={64} />
            <div className="min-w-0">
              <h1 className="font-serif text-2xl text-ink">{profile.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                <span>{t(`profiles.kind.${profile.kind}`)}</span>
                <span className="text-line-strong">·</span>
                <span>
                  {ageText(
                    profile.birthDate,
                    profile.birthPrecision,
                    profile.deathDate ?? todayCalendar(),
                    t,
                    { deathDate: profile.deathDate },
                  ) ?? t('age.unknown')}
                </span>
                <span className="text-line-strong">·</span>
                <span>{t('profiles.meta.events', { n: firstPage?.total ?? 0 })}</span>
              </p>
              {profile.note ? (
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft/85">{profile.note}</p>
              ) : null}
            </div>
          </section>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <ChipSelect
              ariaLabel={t('timeline.filter.year')}
              value={year ? String(year) : ''}
              onChange={(value) => setYear(value ? Number(value) : undefined)}
            >
              <option value="">{t('timeline.filter.allYears')}</option>
              {years.map((item) => (
                <option key={item.year} value={item.year}>
                  {item.year} · {item.eventCount}
                </option>
              ))}
            </ChipSelect>
            {(['milestone', 'birthday', 'health', 'travel', 'school', 'daily', 'other'] as const).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(type === item ? undefined : item)}
                  className={`chip ${type === item ? 'chip-active' : 'bg-surface'}`}
                >
                  {eventTypeLabel(item, t)}
                </button>
              ),
            )}
          </div>

          {events.length === 0 ? (
            <EmptyState title={t('timeline.empty.title')} body={t('timeline.empty.body')} />
          ) : (
            <div className="space-y-8">
              {grouped.map(([groupYear, list]) => (
                <section key={groupYear}>
                  <h2 className="mb-3 font-serif text-[26px] leading-none text-ink">{groupYear}</h2>
                  <ol className="relative ml-1 border-l border-line pl-4 sm:pl-6">
                    {list.map((event) => (
                      <li key={event.id} className="relative mb-3.5 last:mb-0">
                        <span
                          className="absolute top-6 -left-[21px] h-2 w-2 rounded-full bg-line-strong ring-4 ring-paper sm:-left-[29px]"
                          aria-hidden="true"
                        />
                        <EventCard
                          event={event}
                          profileId={profile.id}
                          birthDate={profile.birthDate}
                          birthPrecision={profile.birthPrecision}
                          deathDate={profile.deathDate}
                          basePath={`/s/${token}`}
                          onQuickView={(index) => setLightbox({ images: event.media, index })}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              {feed.hasNextPage ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={feed.isFetchingNextPage}
                    onClick={() => void feed.fetchNextPage()}
                  >
                    {t('common.loadMore')}
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center py-2 text-xs text-muted/70">{t('timeline.end')}</div>
              )}
            </div>
          )}
        </>
      )}

      {lightbox ? (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => setLightbox({ ...lightbox, index })}
        />
      ) : null}
    </AppShell>
  );
}
