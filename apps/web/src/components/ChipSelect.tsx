import type { ReactNode } from 'react';

/** 筛选栏用的胶囊下拉：保留原生 select 的可访问性，补一个可见的箭头。 */
export function ChipSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <select
        aria-label={ariaLabel}
        className="chip cursor-pointer appearance-none border-line bg-surface pr-6.5 pl-3 hover:border-line-strong focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-muted"
        fill="none"
        aria-hidden="true"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
