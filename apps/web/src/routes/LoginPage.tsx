import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { useLogin, useSession } from '../lib/queries';
import { useToast } from '../components/toast';
import { Button, Field, LeafIcon } from '../components/ui';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <LeafIcon className="h-6 w-6" />
            </span>
            <p className="mb-2 font-serif text-xs tracking-[0.2em] text-muted">{t('app.name')}</p>
            <h1 className="font-serif text-2xl text-ink">{title}</h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
          </div>
          <div className="card px-5 py-6 shadow-[0_20px_50px_-40px_rgba(33,29,26,0.5)] sm:px-6">
            {children}
          </div>
          <div className="mt-5 text-center text-sm text-muted">{footer}</div>
        </div>
      </div>
      <div className="pb-8 text-center text-xs text-muted/70">
        <p>{t('app.tagline')}</p>
        <p className="mt-1.5 text-[11px] tracking-wide text-muted/60">
          © {new Date().getFullYear()} lantianjialiang
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (session.data?.user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ email: email.trim(), password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-accent underline-offset-2 hover:underline">
            {t('auth.login.toRegister')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label={t('auth.email')} htmlFor="email" required>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" required>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="mt-2 w-full"
          loading={login.isPending}
        >
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
