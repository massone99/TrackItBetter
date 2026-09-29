import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActionButton, Sheet } from '../../shared/components/ui';

/** Shown when a workout is started while another is still open: offers to go back to it. */
export function WorkoutInProgressSheet({ active, onClose }: { active: { id: string; name: string } | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={active !== null} onClose={onClose} title={t('workout.inProgressTitle')} body={active ? t('workout.inProgressBody', { name: active.name }) : undefined}>
      <ActionButton icon="play" label={t('common.resumeWorkout')} onPress={() => { const id = active?.id; onClose(); if (id) router.push({ pathname: '/workout/[id]', params: { id } }); }} />
      <ActionButton label={t('common.close')} secondary onPress={onClose} />
    </Sheet>
  );
}
