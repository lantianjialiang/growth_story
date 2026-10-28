import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MediaDTO } from '@growth/shared';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { useUploadMedia } from '../lib/queries';
import { useToast } from './toast';
import { Button, Modal, SkeletonBlock, Spinner } from './ui';

export interface AvatarPick {
  id: string;
  url: string;
}

/**
 * 头像选择：从档案已有照片里挑，或者直接传一张新的。
 * 只负责「选出 mediaId + 预览地址」，保存由调用方决定（新建档案时先存本地，提交时一起写入）。
 */
export function AvatarPickerModal({
  open,
  profileId,
  currentMediaId,
  onClose,
  onPick,
}: {
  open: boolean;
  profileId: string;
  currentMediaId: string | null;
  onClose: () => void;
  onPick: (pick: AvatarPick | null) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadMedia(profileId);

  const media = useQuery({
    queryKey: ['profile-media', profileId, 'avatar'],
    queryFn: () => api.get<{ items: MediaDTO[] }>(`/api/v1/profiles/${profileId}/media?limit=60`),
    enabled: open && Boolean(profileId),
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await upload.mutateAsync({ files: [file] });
      const item = result.items[0];
      if (!item) {
        toast.error(t('error.generic'));
        return;
      }
      onPick({ id: item.id, url: item.urls.thumb });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const items = media.data?.items ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('profiles.avatar.title')}
      size="lg"
      footer={
        <>
          {currentMediaId ? (
            <Button
              variant="ghost"
              className="mr-auto text-muted"
              onClick={() => {
                onPick(null);
                onClose();
              }}
            >
              {t('profiles.avatar.clear')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
            {t('profiles.avatar.upload')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted">{t('profiles.avatar.hint')}</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {media.isLoading ? (
        <SkeletonBlock className="h-40" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted">{t('profiles.avatar.empty')}</p>
          <Button variant="outline" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
            {upload.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('profiles.avatar.upload')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {items.map((item) => {
            const active = item.id === currentMediaId;
            return (
              <button
                key={item.id}
                type="button"
                className={`aspect-square overflow-hidden rounded-lg bg-paper-deep ring-2 transition ${
                  active ? 'ring-accent' : 'ring-transparent hover:ring-line-strong'
                }`}
                aria-pressed={active}
                onClick={() => {
                  onPick({ id: item.id, url: item.urls.thumb });
                  onClose();
                }}
              >
                <img src={item.urls.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
