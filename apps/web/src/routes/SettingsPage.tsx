import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n, type Lang } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { useToast } from '../components/toast';
import { Button, Field } from '../components/ui';

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const session = useSession();
  const user = session.data?.user;

  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  const saveProfile = useMutation({
    mutationFn: () => api.patch('/api/v1/auth/me', { displayName: displayName.trim(), locale: lang }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['session'] });
      toast.success(t('settings.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api.post('/api/v1/auth/password', {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      toast.success(t('settings.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <AppShell>
      <h1 className="mb-5 font-serif text-2xl text-ink">{t('settings.title')}</h1>

      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="font-serif text-lg text-ink">{t('settings.profile.title')}</h2>
          <p className="mt-1 text-xs text-muted">{user?.email}</p>

          <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
            <Field label={t('settings.profile.displayName')} htmlFor="displayName">
              <input
                id="displayName"
                className="input"
                value={displayName}
                maxLength={60}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field label={t('settings.profile.locale')} htmlFor="locale">
              <select
                id="locale"
                className="select"
                value={lang}
                onChange={(e) => {
                  const next = e.target.value as Lang;
                  setLang(next);
                  void api.patch('/api/v1/auth/me', { locale: next }).catch(() => undefined);
                }}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>

          <Button variant="primary" loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>
            {t('common.save')}
          </Button>
        </section>

        <section className="card p-5">
          <h2 className="font-serif text-lg text-ink">{t('settings.password.title')}</h2>
          <p className="mt-1 text-xs text-muted">{t('settings.password.hint')}</p>

          <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
            <Field label={t('settings.password.current')} htmlFor="currentPassword">
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label={t('settings.password.new')} htmlFor="newPassword">
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
          </div>

          <Button
            variant="primary"
            loading={changePassword.isPending}
            disabled={!currentPassword || newPassword.length < 8}
            onClick={() => changePassword.mutate()}
          >
            {t('settings.password.submit')}
          </Button>
        </section>

        <section className="card bg-paper-deep/40 p-5">
          <h2 className="font-serif text-lg text-ink">{t('settings.privacy.title')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft/85">
            {t('settings.privacy.body')}
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            <li>· 照片上传时重新编码，EXIF 中的 GPS、设备信息不会落盘。</li>
            <li>· 公开链接使用 256 位随机 token，可随时撤销或设置过期。</li>
            <li>· 事件可标记为「仅成员可见」，不会出现在任何公开链接中。</li>
            <li>· 删除的内容进入回收站保留 30 天，之后自动清除。</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
