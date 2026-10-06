import { useTranslation } from 'react-i18next';
import { ActionButton, EmptyState } from './ui';

/** What a screen shows when its data could not be read: nothing is lost, and it can try again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="alert-circle-outline"
      title={t('common.loadError')}
      body={t('common.loadErrorBody')}
      action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={onRetry} />}
    />
  );
}
