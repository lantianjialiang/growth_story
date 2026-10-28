import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { eventTypeLabel, type EventDTO } from '@growth/shared';
import { useI18n } from '../i18n';
import { AppShell } from '../components/AppShell';
import { EventCard } from '../components/EventCard';
import { EventForm } from '../components/EventForm';
import { Lightbox } from '../components/Lightbox';
import { Avatar, Button, EmptyState, SkeletonBlock, Spinner } from '../components/ui';
import { ChipSelect } from '../components/ChipSelect';
import { ViewSwitch } from '../components/ViewSwitch';
import { useEventTypes, useProfile, useProfileFacets, useProfileTags, useTimeline } from '../lib/queries';
import { ageText, compactDate, todayCalendar } from '../lib/format';

export function TimelinePage() {
  const { profileId = '' } = useParams();
  const { t, lang } = useI18n();
  const [search, setSearch] = useSearchParams();

  const year = search.get('year') ? Number(search.get('year')) : undefined;
  const type = search.get('type') ?? undefined;
  const tag = search.get('tag') ?? undefined;

  const profileQuery = useProfile(profileId);
  const tagsQuery = useProfileTags(profileId);
  const typesQuery = useEventTypes(profileId);
  const timeline = useTimeline(profileId, { year, type, tag });
  const facets = useProfileFacets(profileId, { year, type, tag });

  const [creating, setCreating] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: EventDTO['media']; index: number } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const profile = profileQuery.data?.profile;
  const allYears = useMemo(
    () => timeline.data?.pages[0]?.years ?? profileQuery.data?.years ?? [],
    [timeline.data, profileQuery.data],
  );
  /** 年份下拉的计数跟着标签/类型筛选走；没有匹配的年份只保留当前选中的那个。 */
  const years = useMemo(() => {
    if (!facets.data) return allYears;
    const counts = new Map(facets.data.years.map((item) => [item.year, item.eventCount]));
    return allYears
      .map((item) => ({ ...item, eventCount: counts.get(item.year) ?? 0 }))
      .filter((item) => item.eventCount > 0 || item.year === year);
  }, [allYears, facets.data, year]);

  /** 标签下拉：计数同样跟着年份/类型筛选走，0 条的标签留在列表里但排到最后。 */
  const tagOptions = useMemo(
    () => facets.data?.tags ?? tagsQuery.data?.items ?? [],
    [facets.data, tagsQuery.data],
  );
  const events = useMemo(
    () => timeline.data?.pages.flatMap((page) => page.items) ?? [],
    [timeline.data],
  );
  const total = timeline.data?.pages[0]?.filteredTotal ?? 0;

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

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !timeline.hasNextPage || timeline.isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void timeline.fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [timeline]);

  const patchFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(search);
    if (!value) next.delete(key);
    else next.set(key, value);
    setSearch(next, { replace: true });
  };

  const hasFilter = Boolean(year || type || tag);
  const isOwnerOrEditor = profile?.role === 'owner' || profile?.role === 'editor';
  const age = profile?.birthDate
    ? ageText(profile.birthDate, profile.birthPrecision, profile.deathDate ?? todayCalendar(), t, {
        deathDate: profile.deathDate,
        deceased: Boolean(profile.deathDate),
      })
    : null;

  return (
    <AppShell>
      {profileQuery.isLoading ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : !profile ? (
        <EmptyState title={t('error.notFound')} body="这个档案可能已被删除，或你没有访问权限。" />
      ) : (
        <>
          <section className="mb-5">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar src={profile.avatarUrl} name={profile.name} kind={profile.kind} size={68} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-[26px] leading-tight text-ink">{profile.name}</h1>
                  {profile.archivedAt ? (
                    <span className="rounded bg-paper-deep px-1.5 py-0.5 text-[10px] text-muted">
                      {t('profiles.archived')}
                    </span>
                  ) : null}
                  {profile.deathDate ? (
                    <span className="rounded bg-paper-deep px-1.5 py-0.5 text-[10px] text-muted">
                      {compactDate(profile.deathDate, profile.deathPrecision)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                  <span>{t(`profiles.kind.${profile.kind}`)}</span>
                  {age ? (
                    <>
                      <span className="text-line-strong">·</span>
                      <span>{age}</span>
                    </>
                  ) : null}
                  {profile.birthDate ? (
                    <>
                      <span className="text-line-strong">·</span>
                      <span>{compactDate(profile.birthDate, profile.birthPrecision)}</span>
                    </>
                  ) : null}
                  <span className="text-line-strong">·</span>
                  <span>{t('profiles.meta.events', { n: profile.eventCount })}</span>
                  {profile.mediaCount > 0 ? (
                    <>
                      <span className="text-line-strong">·</span>
                      <span>{t('profiles.meta.media', { n: profile.mediaCount })}</span>
                    </>
                  ) : null}
                </p>
                {profile.note ? (
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-soft/80">{profile.note}</p>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <ViewSwitch profileId={profile.id} current="timeline" search={search.toString()} />
                {isOwnerOrEditor ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <span className="text-base leading-none">＋</span>
                    {t('timeline.addEvent')}
                  </Button>
                ) : null}
                {profile.role === 'owner' ? (
                  <Link to={`/p/${profile.id}/manage`} className="btn btn-outline">
                    {t('timeline.manage')}
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line/70 bg-paper/92 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <ChipSelect
                ariaLabel={t('timeline.filter.year')}
                value={year ? String(year) : ''}
                onChange={(value) => patchFilter('year', value || undefined)}
              >
                <option value="">{t('timeline.filter.allYears')}</option>
                {years.map((y) => (
                  <option key={y.year} value={y.year}>
                    {lang.startsWith('zh') ? `${y.year} 年` : y.year} · {y.eventCount}
                  </option>
                ))}
              </ChipSelect>

              {(tagsQuery.data?.items.length ?? 0) > 0 ? (
                <ChipSelect
                  ariaLabel={t('timeline.filter.tag')}
                  value={tag ?? ''}
                  onChange={(value) => patchFilter('tag', value || undefined)}
                >
                  <option value="">{t('timeline.filter.allTags')}</option>
                  {tagOptions.map((item) => (
                    <option key={item.name} value={item.name}>
                      #{item.name} ({item.count})
                    </option>
                  ))}
                </ChipSelect>
              ) : null}

              <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />

              {(typesQuery.data?.items ?? []).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => patchFilter('type', type === item.type ? undefined : item.type)}
                  className={`chip shrink-0 ${type === item.type ? 'chip-active' : 'bg-surface'}`}
                >
                  {eventTypeLabel(item.type, t)}
                </button>
              ))}

              {hasFilter ? (
                <button
                  type="button"
                  onClick={() => setSearch(new URLSearchParams(), { replace: true })}
                  className="shrink-0 px-2 text-xs text-accent hover:underline"
                >
                  {t('timeline.filter.clear')}
                </button>
              ) : null}
            </div>
          </div>

          {timeline.isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-32" />
              <SkeletonBlock className="h-32" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              title={hasFilter ? t('timeline.empty.filtered') : t('timeline.empty.title')}
              body={hasFilter ? undefined : t('timeline.empty.body')}
              action={
                hasFilter ? (
                  <Button variant="outline" onClick={() => setSearch(new URLSearchParams(), { replace: true })}>
                    {t('timeline.filter.clear')}
                  </Button>
                ) : isOwnerOrEditor ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    {t('timeline.addEvent')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-8">
              {grouped.map(([groupYear, list]) => (
                <section key={groupYear} id={`year-${groupYear}`}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 className="font-serif text-[26px] leading-none text-ink">{groupYear}</h2>
                    <span className="text-xs text-muted">
                      {t('profiles.meta.events', { n: list.length })}
                    </span>
                  </div>
                  <ol className="relative ml-1 border-l border-line pl-4 sm:ml-2 sm:pl-6">
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
                          onQuickView={(index) => setLightbox({ images: event.media, index })}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              <div ref={sentinel} className="flex justify-center py-2">
                {timeline.isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    <Spinner className="h-3.5 w-3.5" /> {t('common.loading')}
                  </span>
                ) : timeline.hasNextPage ? (
                  <Button variant="outline" size="sm" onClick={() => void timeline.fetchNextPage()}>
                    {t('common.loadMore')}
                  </Button>
                ) : events.length >= total && total > 0 ? (
                  <span className="text-xs text-muted/70">{t('timeline.end')}</span>
                ) : null}
              </div>
            </div>
          )}

          <EventForm
            open={creating}
            onClose={() => setCreating(false)}
            profileId={profile.id}
            defaultDate={year ? `${year}-01-01` : undefined}
          />

          {lightbox ? (
            <Lightbox
              images={lightbox.images}
              index={lightbox.index}
              onClose={() => setLightbox(null)}
              onIndexChange={(index) => setLightbox({ ...lightbox, index })}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}
