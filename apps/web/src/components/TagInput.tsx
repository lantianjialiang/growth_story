import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';

export interface TagSuggestion {
  name: string;
  count: number;
}

const MAX_TAG_LENGTH = 24;
const MAX_TAGS = 12;
/** 下拉里最多同时展示的候选数量，再多就靠输入过滤 */
const MAX_OPTIONS = 8;

function normalize(raw: string): string {
  return raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
}

/**
 * 标签输入框：已选框内 chip + 可搜索的下拉候选。
 * 候选来自档案里已有的标签，避免"想不起上次用过什么"而写出同义标签。
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: TagSuggestion[];
  placeholder?: string;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lowerValue = useMemo(() => new Set(value.map((tag) => tag.toLowerCase())), [value]);
  const query = draft.trim().toLowerCase();

  const candidates = useMemo(() => {
    return suggestions
      .filter((item) => !lowerValue.has(item.name.toLowerCase()))
      .filter((item) => (query ? item.name.toLowerCase().includes(query) : true))
      .slice(0, MAX_OPTIONS);
  }, [suggestions, lowerValue, query]);

  const typed = normalize(draft);
  const canCreate =
    typed.length > 0 &&
    value.length < MAX_TAGS &&
    !value.some((tag) => tag.toLowerCase() === typed.toLowerCase());

  // 候选项 + 末尾的"新建"行，用同一个高亮索引
  const rows: { kind: 'pick' | 'create'; name: string; count?: number }[] = [
    ...candidates.map((item) => ({ kind: 'pick' as const, name: item.name, count: item.count })),
    ...(canCreate ? [{ kind: 'create' as const, name: typed }] : []),
  ];

  useEffect(() => {
    setActive(0);
  }, [draft, open]);

  // 点外面收起
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const add = (raw: string) => {
    const name = normalize(raw);
    if (!name) return;
    if (value.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
      setDraft('');
      return;
    }
    if (value.length >= MAX_TAGS) return;
    onChange([...value, name]);
    setDraft('');
  };

  const remove = (name: string) => {
    onChange(value.filter((tag) => tag !== name));
    inputRef.current?.focus();
  };

  const commitDraft = () => {
    const row = rows[active];
    if (draft.trim() && row) add(row.name);
    else if (draft.trim()) add(draft);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
        className="input flex min-h-11 cursor-text flex-wrap items-center gap-1.5 py-1.5"
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
          >
            #{tag}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                remove(tag);
              }}
              aria-label={t('event.tags.remove', { name: tag })}
              className="text-[13px] leading-none text-accent/70 hover:text-accent"
            >
              ×
            </button>
          </span>
        ))}

        {value.length < MAX_TAGS ? (
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-24 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            placeholder={value.length === 0 ? placeholder : t('event.tags.more')}
            onChange={(event) => {
              const next = event.target.value;
              // 逗号 / 顿号 / 分号都当作"确认一个标签"
              if (/[,，、;；]$/.test(next)) add(next);
              else setDraft(next);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActive((prev) => (rows.length === 0 ? 0 : (prev + 1) % rows.length));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                setActive((prev) => (rows.length === 0 ? 0 : (prev - 1 + rows.length) % rows.length));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                setDraft('');
              } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
                remove(value[value.length - 1]!);
              }
            }}
          />
        ) : (
          <span className="px-1 text-xs text-muted">{t('event.tags.limit', { n: MAX_TAGS })}</span>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          aria-label={t('event.tags.toggle')}
          aria-expanded={open}
          className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-accent"
        >
          ▾
        </button>
      </div>

      {open && rows.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-[0_18px_40px_-24px_rgba(33,29,26,0.45)]"
        >
          {rows.map((row, index) => {
            const highlighted = index === active;
            return (
              <li key={`${row.kind}-${row.name}`} role="option" aria-selected={highlighted}>
                <button
                  type="button"
                  // 用 mousedown 抢在 blur 之前，避免下拉先被关掉
                  onMouseDown={(event) => {
                    event.preventDefault();
                    add(row.name);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    highlighted ? 'bg-accent-soft/60 text-ink' : 'text-ink-soft hover:bg-paper-deep/60'
                  }`}
                >
                  {row.kind === 'create' ? (
                    <span className="flex items-center gap-1.5 text-accent">
                      <span className="text-base leading-none">＋</span>
                      {t('event.tags.create', { name: row.name })}
                    </span>
                  ) : (
                    <span className="truncate">#{row.name}</span>
                  )}
                  {row.kind === 'pick' && row.count ? (
                    <span className="shrink-0 text-[11px] text-muted">{row.count}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
