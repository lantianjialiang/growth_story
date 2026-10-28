import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
      <div className="w-full">
        <EmptyState
          title={t('error.notFound')}
          body="链接可能有误，或者内容已被删除。"
          action={
            <Link to="/" className="btn btn-outline">
              {t('common.back')}
            </Link>
          }
        />
      </div>
    </div>
  );
}
