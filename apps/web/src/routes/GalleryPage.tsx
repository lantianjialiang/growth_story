import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { eventTypeLabel, type EventDTO } from '@growth/shared';
import { useI18n } from '../i18n';
import { AppShell } from '../components/AppShell';
import { ChipSelect } from '../components/ChipSelect';
import { EventForm, typeClass } from '../components/EventForm';
import { Lightbox } from '../components/Lightbox';
import { ViewSwitch } from '../components/ViewSwitch';
import { Button, EmptyState, Spinner } from '../components/ui';
import { useEventTypes, useProfile, useProfileFacets, useProfileTags, useTimeline } from '../lib/queries';
import { ageText, dateText } from '../lib/format';

/**
 * 舞台高度恒定，宽度占满左栏：
 * 换展品、或者从有照片的记录切到纯文字记录时，画面尺寸完全不变，不会抖。
 * 竖图 / 宽幅图两侧用同一张图的模糊版本铺满，不留死白。
 */
const STAGE_HEIGHT = 'clamp(260px, 46vh, 520px)';

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GalleryPage() {
  const { profileId = '' } = useParams();
  const { t, lang } = useI18n();
  const [search, setSearch] = useSearchParams();

  const year = search.get('year') ? Number(search.get('year')) : undefined;
  const type = search.get('type') ?? undefined;
  const tag = search.get('tag') ?? undefined;
  /** 画廊默认只陈列有照片的记录；切到 all 才把纯文字记录也排进时间线 */
  const scope = search.get('scope') === 'all' ? 'all' : 'photos';

  const profileQuery = useProfile(profileId);
  const tagsQuery = useProfileTags(profileId);
  const typesQuery = useEventTypes(profileId);
  const timeline = useTimeline(profileId, { year, type, tag });
  const facets = useProfileFacets(profileId, { year, type, tag });

  const profile = profileQuery.data?.profile;
  const events = useMemo(
    () => timeline.data?.pages.flatMap((page) => page.items) ?? [],
    [timeline.data],
  );
  const exhibits = useMemo(
    () => (scope === 'photos' ? events.filter((event) => event.media.length > 0) : events),
    [events, scope],
  );
  const allYears = useMemo(
    () => timeline.data?.pages[0]?.years ?? profileQuery.data?.years ?? [],
    [timeline.data, profileQuery.data],
  );
  /** 年份与标签的计数都跟着其它筛选条件走，避免数字和实际结果对不上。 */
  const years = useMemo(() => {
    if (!facets.data) return allYears;
    const counts = new Map(facets.data.years.map((item) => [item.year, item.eventCount]));
    return allYears
      .map((item) => ({ ...item, eventCount: counts.get(item.year) ?? 0 }))
      .filter((item) => item.eventCount > 0 || item.year === year);
  }, [allYears, facets.data, year]);
  const tagOptions = useMemo(() => {
    const items = facets.data?.tags ?? tagsQuery.data?.items ?? [];
    return items.filter((item) => item.count > 0 || item.name === tag);
  }, [facets.data, tagsQuery.data, tag]);
  const total = timeline.data?.pages[0]?.filteredTotal ?? 0;

  const [index, setIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const photoStripRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const autoLocated = useRef(false);

  const filterKey = `${year ?? ''}|${type ?? ''}|${tag ?? ''}|${scope}`;
  const hasFilter = Boolean(year || type || tag);
  const isOwnerOrEditor = profile?.role === 'owner' || profile?.role === 'editor';

  const current: EventDTO | undefined = exhibits[index];
  const photos = useMemo(() => current?.media ?? [], [current]);
  const photo = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))] ?? null;
  /** 事件内还有照片时，左右键只换照片，不更换整个展台上下文 */
  const canPrev = index > 0 || photoIndex > 0;
  const canNext =
    photoIndex < photos.length - 1 || index < exhibits.length - 1 || timeline.hasNextPage;

  // 筛选变化时回到第一件
  useEffect(() => {
    autoLocated.current = false;
    setIndex(0);
    setPhotoIndex(0);
  }, [filterKey]);

  // 「全部记录」模式下先落到最近一条带照片的记录，避免第一屏就是文字页
  useEffect(() => {
    if (scope !== 'all' || autoLocated.current || events.length === 0) return;
    const firstWithPhoto = events.findIndex((event) => event.media.length > 0);
    if (firstWithPhoto > 0) setIndex(firstWithPhoto);
    autoLocated.current = true;
  }, [events, scope]);

  // 只看照片时，当前页可能一张都没有：继续往后取，直到出现照片或没有更多
  useEffect(() => {
    if (scope !== 'photos' || exhibits.length > 0) return;
    if (timeline.hasNextPage && !timeline.isFetchingNextPage) void timeline.fetchNextPage();
  }, [scope, exhibits.length, timeline]);

  // 数据变短时把索引收回有效范围
  useEffect(() => {
    if (exhibits.length > 0 && index > exhibits.length - 1) setIndex(exhibits.length - 1);
    if (exhibits.length === 0 && index !== 0) setIndex(0);
  }, [exhibits.length, index]);

  const go = useCallback(
    (delta: number) => {
      const list = exhibits[index]?.media ?? [];
      if (delta > 0) {
        // 先把当前这条记录的照片翻完，再换展品
        if (photoIndex < list.length - 1) {
          setPhotoIndex(photoIndex + 1);
          return;
        }
        const next = index + 1;
        if (next > exhibits.length - 1) {
          if (timeline.hasNextPage && !timeline.isFetchingNextPage) void timeline.fetchNextPage();
          return;
        }
        setIndex(next);
        setPhotoIndex(0);
        return;
      }

      if (photoIndex > 0) {
        setPhotoIndex(photoIndex - 1);
        return;
      }
      const prev = index - 1;
      if (prev < 0) return;
      setIndex(prev);
      // 往回翻时落在上一件的最后一张，翻页手感连续
      const prevCount = exhibits[prev]?.media.length ?? 0;
      setPhotoIndex(Math.max(0, prevCount - 1));
    },
    [index, photoIndex, exhibits, timeline],
  );

  // 键盘左右切换（灯箱打开时让出按键）
  useEffect(() => {
    if (lightbox !== null) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, lightbox]);

  // 预取下一张照片（翻完照片再取下一件的主图），翻页不白屏
  useEffect(() => {
    const nextPhoto = photos[photoIndex + 1];
    const url = nextPhoto?.urls.medium ?? exhibits[index + 1]?.media[0]?.urls.medium;
    if (!url) return;
    const img = new Image();
    img.src = url;
  }, [index, photoIndex, photos, exhibits]);

  // 胶片条：当前展品已经完整可见时不动，避免来回滚动
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const viewLeft = strip.scrollLeft;
    const viewRight = viewLeft + strip.clientWidth;
    if (left >= viewLeft + 8 && right <= viewRight - 8) return;
    const target = left - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [index, exhibits.length]);

  // 多图缩略条跟随当前照片，但已经可见时不动
  useEffect(() => {
    const strip = photoStripRef.current;
    if (!strip || !photo) return;
    const active = strip.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const viewLeft = strip.scrollLeft;
    const viewRight = viewLeft + strip.clientWidth;
    if (left >= viewLeft && right <= viewRight) return;
    strip.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' });
  }, [photo]);

  const patchFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(search);
    if (!value) next.delete(key);
    else next.set(key, value);
    setSearch(next, { replace: true });
  };

  const searchString = search.toString();
  const typeOptions = typesQuery.data?.items ?? [];

  const body = (() => {
    if (profileQuery.isLoading || timeline.isLoading) {
      return <div className="h-[clamp(260px,52vh,560px)] animate-pulse rounded-3xl bg-paper-deep" />;
    }
    if (!profile) {
      return <EmptyState title={t('error.notFound')} body="这个档案可能已被删除，或你没有访问权限。" />;
    }
    if (exhibits.length === 0 || !current) {
      if (scope === 'photos' && timeline.hasNextPage) {
        return (
          <div className="flex h-[clamp(200px,34vh,380px)] items-center justify-center rounded-3xl border border-dashed border-line-strong">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        );
      }
      return (
        <EmptyState
          title={hasFilter ? t('timeline.empty.filtered') : t('gallery.empty.title')}
          body={hasFilter ? undefined : t('gallery.empty.body')}
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
      );
    }

    const age = profile.birthDate
      ? ageText(profile.birthDate, profile.birthPrecision, current.date, t, {
          deathDate: profile.deathDate,
          deceased: Boolean(profile.deathDate),
        })
      : null;

    return (
      <div>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-9">
          {/* 左：舞台。高度恒定，有照片和纯文字记录占位一样大，切换时画面不跳 */}
          <div className="min-w-0">
            <div
              className="relative"
              style={{ height: STAGE_HEIGHT }}
              onTouchStart={(e) => {
                touchX.current = e.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) > 48) go(dx > 0 ? -1 : 1);
              }}
            >
              {photo ? (
                <div
                  key={current.id}
                  className="exhibit-enter relative h-full w-full overflow-hidden rounded-3xl border border-line bg-paper-deep/70"
                >
                  {/* 竖图 / 宽幅图两侧用同一张图的模糊版本铺满，而不是留一块死白 */}
                  <img
                    src={photo.urls.thumb}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl"
                  />
                  <div className="absolute inset-0 bg-ink/[0.06]" />
                  <button
                    type="button"
                    onClick={() => setLightbox(Math.min(photoIndex, photos.length - 1))}
                    className="relative h-full w-full cursor-zoom-in"
                    aria-label={photo.altText ?? current.title}
                  >
                    <img
                      key={photo.id}
                      src={photo.urls.medium}
                      alt={photo.altText ?? current.title}
                      className="photo-in h-full w-full object-contain"
                      draggable={false}
                    />
                  </button>
                  {photos.length > 1 ? (
                    <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-ink/55 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm">
                      {t('gallery.photoOf', {
                        current: Math.min(photoIndex, photos.length - 1) + 1,
                        total: photos.length,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div
                  key={current.id}
                  className="exhibit-enter flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-paper-deep/70 px-8 text-center"
                >
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${typeClass(current.type)}`}>
                    {eventTypeLabel(current.type, t)}
                  </span>
                  <p className="font-serif text-2xl leading-snug text-ink/80">{current.title}</p>
                  <p className="text-xs text-muted">{t('gallery.noPhoto')}</p>
                </div>
              )}

              {/* 左右切换贴在舞台两侧 */}
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={!canPrev}
                aria-label={photoIndex > 0 ? t('gallery.prevPhoto') : t('gallery.prev')}
                className="absolute top-1/2 -left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/95 text-ink-soft shadow-[0_10px_24px_-16px_rgba(33,29,26,0.6)] transition hover:text-accent disabled:pointer-events-none disabled:opacity-0 sm:-left-5"
              >
                <Arrow direction="left" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={!canNext}
                aria-label={photoIndex < photos.length - 1 ? t('gallery.nextPhoto') : t('gallery.next')}
                className="absolute top-1/2 -right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/95 text-ink-soft shadow-[0_10px_24px_-16px_rgba(33,29,26,0.6)] transition hover:text-accent disabled:pointer-events-none disabled:opacity-0 sm:-right-5"
              >
                <Arrow direction="right" />
              </button>
            </div>

          </div>

          {/* 右：展签。桌面端在图片右边，手机端落到图片下方 */}
          <aside className="mt-5 min-w-0 lg:mt-0 lg:border-l lg:border-line/70 lg:pl-6 xl:pl-7">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted lg:justify-start">
              <time dateTime={current.date} className="font-medium tracking-wide text-ink-soft">
                {dateText(current.date, current.datePrecision, lang)}
              </time>
              {age ? (
                <>
                  <span className="text-line-strong">·</span>
                  <span>{age}</span>
                </>
              ) : null}
              <span className="text-line-strong">·</span>
              <span>{eventTypeLabel(current.type, t)}</span>
            </div>

            <h2 className="mt-2 text-center font-serif text-xl leading-snug text-ink lg:text-left xl:text-2xl">
              <Link to={`/p/${profile.id}/e/${current.id}`} className="hover:text-accent">
                {current.title}
              </Link>
            </h2>

            {current.body ? (
              <p className="mt-2.5 text-center text-sm leading-[1.9] whitespace-pre-line text-ink-soft/90 lg:text-left lg:line-clamp-[11]">
                {current.body.length > 420 ? `${current.body.slice(0, 420)}…` : current.body}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-muted lg:justify-start">
              {current.placeText ? (
                <span className="inline-flex items-center gap-1">
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                    <path
                      d="M8 14s4.5-4.1 4.5-7A4.5 4.5 0 0 0 3.5 7c0 2.9 4.5 7 4.5 7Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="8" cy="7" r="1.4" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  {current.placeText}
                </span>
              ) : null}
              {current.tags.map((item) => (
                <span key={item} className="rounded-md bg-paper-deep px-1.5 py-0.5 text-[11px]">
                  #{item}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3 text-xs lg:justify-start">
              <Link
                to={`/p/${profile.id}/e/${current.id}`}
                className="text-accent underline-offset-4 hover:underline"
              >
                {t('gallery.openEvent')}
              </Link>
              <span className="text-line-strong">·</span>
              <span className="text-muted">
                {t('gallery.counter', {
                  current: index + 1,
                  total: `${scope === 'photos' ? exhibits.length : total || events.length}${timeline.hasNextPage ? '+' : ''}`,
                })}
              </span>
            </div>

            {/* 一条记录有多张照片时，缩略条跟在展签下面（而不是压在图片下方） */}
            {photos.length > 1 ? (
              <div className="mt-4 border-t border-line/70 pt-3">
                <p className="mb-2 text-center text-[11px] text-muted lg:text-left">
                  {t('gallery.photosOf', { n: photos.length })}
                </p>
                <div
                  ref={photoStripRef}
                  className="flex flex-wrap justify-center gap-1.5 lg:justify-start"
                >
                  {photos.map((item, i) => {
                    const active = i === Math.min(photoIndex, photos.length - 1);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-active={active}
                        onClick={() => setPhotoIndex(i)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                          active ? 'ring-accent' : 'ring-transparent hover:ring-line-strong'
                        }`}
                        aria-label={item.altText ?? `${current.title} ${i + 1}`}
                        aria-current={active ? 'true' : undefined}
                      >
                        <img
                          src={item.urls.thumb}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        {/* 展览条 */}
        <div className="mt-6 border-t border-line/70 pt-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted">
            <span className="min-w-0 truncate">
              <span className="text-ink-soft">{t('gallery.strip')}</span> · {t('gallery.hint')}
            </span>
            {timeline.hasNextPage ? (
              <button
                type="button"
                className="shrink-0 text-accent hover:underline disabled:opacity-60"
                disabled={timeline.isFetchingNextPage}
                onClick={() => void timeline.fetchNextPage()}
              >
                {timeline.isFetchingNextPage ? <Spinner className="h-3 w-3" /> : t('gallery.more')}
              </button>
            ) : null}
          </div>
          <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-2">
            {exhibits.map((event, i) => {
              const cover = event.media[0];
              const active = i === index;
              return (
                <button
                  key={event.id}
                  type="button"
                  data-active={active}
                  onClick={() => {
                    setIndex(i);
                    setPhotoIndex(0);
                  }}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition ${
                    active
                      ? 'border-accent ring-2 ring-accent/35'
                      : 'border-line opacity-70 hover:opacity-100'
                  }`}
                  title={event.title}
                  aria-current={active ? 'true' : undefined}
                >
                  {cover ? (
                    <img
                      src={cover.urls.thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-paper-deep px-1 text-center font-serif text-[10px] leading-tight text-muted">
                      {event.title.slice(0, 6)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <AppShell width="wide">
      {profile ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={`/p/${profile.id}`} className="truncate text-xs text-muted hover:text-accent">
              ← {profile.name}
            </Link>
            <span className="hidden h-3.5 w-px bg-line sm:block" />
            <h1 className="sr-only font-serif text-xl text-ink sm:not-sr-only">{t('gallery.title')}</h1>
            {isOwnerOrEditor ? (
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                <span className="text-sm leading-none">＋</span>
                {t('timeline.addEvent')}
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center rounded-full border border-line bg-surface p-0.5 text-xs"
              title={t('gallery.scope.hint')}
            >
              {(
                [
                  ['photos', t('gallery.scope.photos')],
                  ['all', t('gallery.scope.all')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => patchFilter('scope', value === 'all' ? 'all' : undefined)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    scope === value ? 'bg-paper-deep text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className={`chip ${hasFilter ? 'chip-active' : 'bg-surface'}`}
            >
              {t('gallery.filter')}
              {hasFilter
                ? ` · ${[year, type && eventTypeLabel(type, t), tag && `#${tag}`].filter(Boolean).length}`
                : ''}
            </button>
            <ViewSwitch profileId={profile.id} current="gallery" search={searchString} />
          </div>
        </div>
      ) : null}

      {filtersOpen && profile ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5">
          <ChipSelect
            ariaLabel={t('timeline.filter.year')}
            value={year ? String(year) : ''}
            onChange={(value) => patchFilter('year', value || undefined)}
          >
            <option value="">{t('timeline.filter.allYears')}</option>
            {years.map((item) => (
              <option key={item.year} value={item.year}>
                {lang.startsWith('zh') ? `${item.year} 年` : item.year} · {item.eventCount}
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

          {typeOptions.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => patchFilter('type', type === item.type ? undefined : item.type)}
              className={`chip ${type === item.type ? 'chip-active' : 'bg-surface'}`}
            >
              {eventTypeLabel(item.type, t)}
            </button>
          ))}

          {hasFilter ? (
            <button
              type="button"
              onClick={() => setSearch(new URLSearchParams(), { replace: true })}
              className="px-2 text-xs text-accent hover:underline"
            >
              {t('timeline.filter.clear')}
            </button>
          ) : null}
        </div>
      ) : null}

      {body}

      {profile ? (
        <>
          <EventForm
            open={creating}
            onClose={() => setCreating(false)}
            profileId={profile.id}
            defaultDate={year ? `${year}-01-01` : undefined}
          />
          <Lightbox
            images={photos}
            index={lightbox}
            onClose={() => setLightbox(null)}
            onIndexChange={(next) => {
              setLightbox(next);
              setPhotoIndex(next);
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}
