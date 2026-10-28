import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { useRegister, useSession } from '../lib/queries';
import { useToast } from '../components/toast';
import { Button, Field } from '../components/ui';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  const { t } = useI18n();
  const session = useSession();
  const register = useRegister();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (session.data?.user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('两次输入的密码不一致');
      return;
    }
    try {
      await register.mutateAsync({ email: email.trim(), password, displayName: displayName.trim() });
      window.location.href = '/';
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-accent underline-offset-2 hover:underline">
            {t('auth.register.toLogin')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label={t('auth.displayName')} htmlFor="name" required>
          <input
            id="name"
            className="input"
            required
            maxLength={60}
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label={t('auth.email')} htmlFor="email" required>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" hint="至少 8 位" required>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="确认密码" htmlFor="confirm" required>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" className="mt-2 w-full" loading={register.isPending}>
          {t('auth.register.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
