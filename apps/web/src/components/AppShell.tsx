import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useLogout, useSession } from '../lib/queries';
import { Avatar, LeafIcon } from './ui';

export function AppShell({
  children,
  bare = false,
  banner,
  width = 'normal',
}: {
  children: ReactNode;
  bare?: boolean;
  banner?: ReactNode;
  /** 画廊等横向视图可以用更宽的容器 */
  width?: 'normal' | 'wide';
}) {
  const { t } = useI18n();
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = session.data?.user ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    setMenuOpen(false);
    await logout.mutateAsync();
    navigate('/login');
  };

  const container = width === 'wide' ? 'max-w-6xl' : 'max-w-5xl';

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur-md">
        <div
          className={`mx-auto flex h-14 ${container} items-center justify-between gap-3 px-4 sm:px-6`}
        >
          <Link to={user ? '/' : '/login'} className="flex items-center gap-2 text-ink">
            <span className="text-accent">
              <LeafIcon className="h-5 w-5" />
            </span>
            <span className="font-serif text-[15px] tracking-tight">{t('app.name')}</span>
          </Link>

          {!bare && user ? (
            <nav className="flex items-center gap-1 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 transition-colors ${isActive ? 'text-accent' : 'text-ink-soft hover:text-ink'}`
                }
              >
                {t('nav.profiles')}
              </NavLink>
              <NavLink
                to="/trash"
                className={({ isActive }) =>
                  `hidden rounded-full px-3 py-1.5 transition-colors sm:inline-block ${isActive ? 'text-accent' : 'text-ink-soft hover:text-ink'}`
                }
              >
                {t('nav.trash')}
              </NavLink>

              <div ref={menuRef} className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-full py-1 pr-1 pl-2 text-xs text-muted transition-colors hover:text-ink sm:pl-3"
                  title={user.email}
                >
                  <span className="hidden max-w-24 truncate sm:inline">{user.displayName}</span>
                  <Avatar name={user.displayName} size={26} />
                  <svg
                    viewBox="0 0 12 12"
                    className={`mr-1 h-2.5 w-2.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>

                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute top-full right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(33,29,26,0.5)]"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="flex items-center gap-1.5 truncate text-sm text-ink">
                        {user.displayName}
                        {user.role === 'admin' ? (
                          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-normal text-accent">
                            {t('users.role.admin')}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{user.email}</p>
                    </div>
                    <div className="p-1.5">
                      {user.role === 'admin' ? (
                        <Link
                          to="/users"
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className="block rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
                        >
                          {t('nav.users')}
                        </Link>
                      ) : null}
                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
                      >
                        {t('nav.settings')}
                      </Link>
                      <Link
                        to="/trash"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink sm:hidden"
                      >
                        {t('nav.trash')}
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void signOut()}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
                      >
                        {t('nav.logout')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>
      </header>

      {banner}

      <main className={`mx-auto ${container} px-4 pt-6 pb-24 sm:px-6`}>{children}</main>

      <footer
        className={`mx-auto ${container} px-4 pb-8 text-center text-xs text-muted/80 sm:px-6`}
      >
        <span className="font-serif">{t('app.tagline')}</span>
        <span className="mx-2 text-line-strong">·</span>
        <span>{t('app.footerNote')}</span>
        <p className="mt-2 text-[11px] tracking-wide text-muted/60">
          © {new Date().getFullYear()} lantianjialiang
        </p>
      </footer>
    </div>
  );
}
