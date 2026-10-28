import { useEffect, useState } from 'react';
import {
  PROFILE_KINDS,
  type AnniversaryDTO,
  type DatePrecision,
  type ProfileDTO,
  type ProfileKind,
} from '@growth/shared';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { todayCalendar } from '../lib/format';
import { useCreateProfile, useUpdateProfile } from '../lib/queries';
import { useToast } from './toast';
import { Avatar, Button, Field, Modal } from './ui';
import { DateField } from './DateField';
import { AvatarPickerModal } from './AvatarPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  profile?: ProfileDTO | null;
  onSaved?: (profile: ProfileDTO) => void;
}

const GENDERS = ['女', '男', '其他'];

interface AnniversaryDraft {
  id: string;
  label: string;
  date: string;
  precision: DatePrecision;
}

const ANNIVERSARY_PRESETS = ['结婚纪念日', '相识纪念日', '到家日', '入园日'];

function SectionTitle({ children, className = '' }: { children: string; className?: string }) {
  return (
    <h3 className={`mb-3 border-b border-line pb-1.5 text-[13px] font-medium tracking-wide text-ink-soft ${className}`}>
      {children}
    </h3>
  );
}

export function ProfileForm({ open, onClose, profile, onSaved }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const create = useCreateProfile();
  const update = useUpdateProfile(profile?.id ?? '');
  const editing = Boolean(profile);

  const [kind, setKind] = useState<ProfileKind>('child');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [birthPrecision, setBirthPrecision] = useState<DatePrecision>('day');
  const [deathDate, setDeathDate] = useState<string | null>(null);
  const [deathPrecision, setDeathPrecision] = useState<DatePrecision>('day');
  const [anniversaries, setAnniversaries] = useState<AnniversaryDraft[]>([]);
  const [note, setNote] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(profile?.kind ?? 'child');
    setName(profile?.name ?? '');
    setBirthDate(profile?.birthDate ?? null);
    setBirthPrecision(profile?.birthPrecision ?? 'day');
    setDeathDate(profile?.deathDate ?? null);
    setDeathPrecision(profile?.deathPrecision ?? 'day');
    setAnniversaries(
      (profile?.anniversaries ?? []).map((item: AnniversaryDTO) => ({
        id: item.id,
        label: item.label,
        date: item.date,
        precision: item.precision,
      })),
    );
    setNote(profile?.note ?? '');
    setAttributes((profile?.attributes as Record<string, string>) ?? {});
    setAvatarMediaId(profile?.avatarMediaId ?? null);
    setAvatarUrl(profile?.avatarUrl ?? null);
    setPickingAvatar(false);
  }, [open, profile]);

  const attrKeys =
    kind === 'pet' ? ['breed', 'chipId', 'gender', 'allergies'] : ['gender', 'bloodType', 'allergies'];

  const addAnniversary = (label = '') => {
    setAnniversaries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label,
        // 默认今天、精确到日：纪念日大多是要记住"哪一天"的
        date: todayCalendar(),
        precision: 'day',
      },
    ]);
  };

  const patchAnniversary = (id: string, next: Partial<AnniversaryDraft>) => {
    setAnniversaries((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t('profiles.field.name'));
      return;
    }
    const filled = anniversaries.filter((item) => item.label.trim());
    const payload = {
      kind,
      name: name.trim(),
      birthDate,
      birthPrecision,
      deathDate,
      deathPrecision,
      anniversaries: filled.map((item) => ({
        id: item.id,
        label: item.label.trim(),
        date: item.date,
        precision: item.precision,
      })),
      note: note.trim() ? note.trim() : null,
      attributes,
      avatarMediaId,
    };
    try {
      const result = editing
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload as never);
      onSaved?.(result.profile);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('profiles.edit.title') : t('profiles.new.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending || update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {/* 左列：基本信息 + 详细信息 */}
        <div>
          <SectionTitle>{t('profiles.section.basic')}</SectionTitle>

          {/* 头像：编辑时可以从已有照片里挑，也可以直接传一张新的 */}
          <div className="mb-4 flex items-center gap-3">
            <Avatar src={avatarUrl} name={name || '·'} kind={kind} size={64} />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-ink-soft">
                {t('profiles.field.avatar')}
              </p>
              {editing ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button size="sm" variant="outline" onClick={() => setPickingAvatar(true)}>
                    {t('profiles.avatar.change')}
                  </Button>
                  {avatarMediaId ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted underline-offset-2 hover:text-red-600 hover:underline"
                      onClick={() => {
                        setAvatarMediaId(null);
                        setAvatarUrl(null);
                      }}
                    >
                      {t('profiles.avatar.clear')}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {t('profiles.avatar.createHint')}
                </p>
              )}
            </div>
          </div>

          <Field label={t('profiles.field.name')} required htmlFor="profile-name">
            <input
              id="profile-name"
              className="input h-9"
              value={name}
              maxLength={60}
              placeholder={kind === 'pet' ? '咪咪' : '小满'}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label={t('profiles.field.kind')}>
            <div className="flex h-9 items-center gap-1.5">
              {PROFILE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`chip h-8 px-3 ${kind === k ? 'chip-active' : 'bg-surface hover:border-line-strong'}`}
                >
                  {t(`profiles.kind.${k}`)}
                </button>
              ))}
            </div>
          </Field>

          <SectionTitle className="mt-5">{t('profiles.section.detail')}</SectionTitle>

          {attrKeys.map((key) => (
            <Field key={key} label={t(`profiles.field.${key}`)}>
              {key === 'gender' ? (
                <div className="flex h-9 items-center gap-1.5">
                  {GENDERS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`chip h-8 px-3 ${attributes.gender === g ? 'chip-active' : 'bg-surface hover:border-line-strong'}`}
                      onClick={() =>
                        setAttributes((prev) => ({ ...prev, gender: prev.gender === g ? '' : g }))
                      }
                    >
                      {g}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  className="input h-9"
                  value={attributes[key] ?? ''}
                  onChange={(e) => setAttributes((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              )}
            </Field>
          ))}

          <Field label={t('profiles.field.note')} hint={t('common.optional')}>
            <textarea
              className="input min-h-14 resize-y"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        {/* 右列：日期与纪念日 */}
        <div>
          <SectionTitle>{t('profiles.section.dates')}</SectionTitle>

          <DateField
            label={t('profiles.field.birthDate')}
            date={birthDate}
            precision={birthPrecision}
            onChange={(d, p) => {
              setBirthDate(d);
              setBirthPrecision(p);
            }}
            allowClear
          />

          <DateField
            label={t('profiles.field.deathDate')}
            date={deathDate}
            precision={deathPrecision}
            onChange={(d, p) => {
              setDeathDate(d);
              setDeathPrecision(p);
            }}
            allowClear
          />
          <p className="-mt-2 mb-4 text-[11px] leading-relaxed text-muted">
            {t('profiles.field.deathHint')}
          </p>

          <div className="rounded-2xl border border-line bg-paper-deep/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-ink-soft">
                  {t('profiles.field.anniversaries')}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  {t('profiles.field.anniversariesHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => addAnniversary()}
                className="chip h-7 shrink-0 border-accent/60 bg-surface px-2.5 text-[11px] text-accent hover:bg-accent-soft/50"
              >
                ＋ {t('common.add')}
              </button>
            </div>

            {anniversaries.length === 0 ? (
              <p className="pb-1 text-[11px] text-muted">{t('profiles.anniversary.empty')}</p>
            ) : null}

            {anniversaries.length > 0 ? (
              <ul className="space-y-2">
                {anniversaries.map((item) => (
                  <li key={item.id} className="rounded-xl border border-line bg-surface p-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="input h-8 min-w-0 flex-1 py-1 text-sm"
                        value={item.label}
                        maxLength={40}
                        placeholder={t('profiles.anniversary.labelPlaceholder')}
                        aria-label={t('profiles.anniversary.label')}
                        onChange={(e) => patchAnniversary(item.id, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAnniversaries((prev) => prev.filter((row) => row.id !== item.id))
                        }
                        aria-label={t('common.delete')}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-deep hover:text-red-600"
                      >
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                          <path
                            d="M4 6h12M8 6V4.5h4V6m-6.5 0 .6 9.5h7.8L15.5 6"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <DateField
                      compact
                      hideLabel
                      className="mt-2"
                      label={item.label || t('profiles.anniversary.date')}
                      date={item.date}
                      precision={item.precision}
                      onChange={(d, p) => {
                        if (!d) return;
                        patchAnniversary(item.id, { date: d, precision: p });
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1.5">
              {ANNIVERSARY_PRESETS.filter(
                (preset) => !anniversaries.some((item) => item.label === preset),
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addAnniversary(preset)}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/60 hover:text-accent"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {profile ? (
        <AvatarPickerModal
          open={pickingAvatar}
          profileId={profile.id}
          currentMediaId={avatarMediaId}
          onClose={() => setPickingAvatar(false)}
          onPick={(pick) => {
            setAvatarMediaId(pick?.id ?? null);
            setAvatarUrl(pick?.url ?? null);
          }}
        />
      ) : null}
    </Modal>
  );
}
