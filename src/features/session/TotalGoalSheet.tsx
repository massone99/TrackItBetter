import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TotalTargetField, totalDefaultFor } from '../programs/TotalTargetField';
import { ActionButton, Body, Sheet } from '../../shared/components/ui';
import type { SessionExercise } from './repository';

/** Sets, changes or removes an exercise's total goal during a workout. */
export function TotalGoalSheet({ exercise, onClose, onSave }: { exercise: SessionExercise | null; onClose: () => void; onSave: (value: number | null) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<{ entryId: string; value: number } | null>(null);
  const start = exercise ? exercise.totalTarget ?? totalDefaultFor(exercise.metric, null, 0) : 0;
  const value = draft && exercise && draft.entryId === exercise.entryId ? draft.value : start;
  const close = () => { setDraft(null); onClose(); };
  return (
    <Sheet visible={exercise !== null} onClose={close} title={exercise ? t('totalGoal.sheetTitle', { name: exercise.name }) : ''}>
      {exercise ? (
        <>
          <Body>{t('totalGoal.sheetBody')}</Body>
          <TotalTargetField metric={exercise.metric} value={value} onChange={(next) => setDraft({ entryId: exercise.entryId, value: next })} />
          <ActionButton icon="checkmark" label={t('common.save')} onPress={() => { setDraft(null); onSave(value); }} />
          {exercise.totalTarget != null ? <ActionButton icon="close" label={t('totalGoal.remove')} secondary onPress={() => { setDraft(null); onSave(null); }} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}
