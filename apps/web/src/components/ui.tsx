import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const KIND_TINT: Record<string, string> = {
  person: 'bg-amber-soft text-[#8a6a2c]',
  child: 'bg-accent-soft text-accent',
  pet: 'bg-olive-soft text-olive',
};

export function Avatar({
  src,
  name,
  size = 44,
  kind = 'person',
  className = '',
}: {
  src?: string | null;
  name: string;
  size?: number;
  kind?: string;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(12, size * 0.36) };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        style={style}
        className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-serif ${KIND_TINT[kind] ?? KIND_TINT.person} ${className}`}
    >
      {name.trim().slice(0, 1) || '·'}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      <div className="mb-4 text-accent/70">{icon ?? <LeafIcon />}</div>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {body ? <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LeafIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M25 7c0 9.5-5.4 15-13 15H8c0-9.4 5.4-15 13-15h4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7 26c2.2-5.6 6-9.4 12-12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-accent">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button',
      );
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/35 p-0 backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[4vh]">
      <button
        type="button"
        aria-label="close"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'} rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-base text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon -mr-1 text-muted"
            aria-label="close"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-5 py-5 sm:max-h-[calc(100dvh-10rem)]">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Button({
  variant = 'outline',
  size,
  className = '',
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm';
  loading?: boolean;
}) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'ghost'
        ? 'btn-ghost'
        : variant === 'danger'
          ? 'btn-danger'
          : 'btn-outline';
  return (
    <button
      className={`btn ${variantClass} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`hairline ${className}`} />;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper-deep ${className}`} />;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  destructive = true,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
    </Modal>
  );
}
