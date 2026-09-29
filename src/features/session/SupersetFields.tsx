import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, SegmentedControl, Stepper } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';
import { linkWithNext, setSupersetRest, unlinkEntry, type SessionExercise } from './repository';
import { parseSupersetType, type SupersetRest } from './superset';

/** Superset controls in the exercise menu: link with the next exercise, rest mode, unlink. */
export function SupersetFields({ exercise, hasNext, onChanged }: { exercise: SessionExercise; hasNext: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [rest, setRest] = useState<SupersetRest>(() => parseSupersetType(exercise.groupType));
  const groupId = exercise.groupId;
  const save = (next: SupersetRest) => {
    setRest(next);
    if (groupId) void setSupersetRest(groupId, next);
  };
  return <>
    {groupId ? <>
      <SegmentedControl<SupersetRest['mode']>
        value={rest.mode}
        onChange={(mode) => save({ mode, betweenSec: mode === 'between' ? rest.betweenSec || 30 : 0 })}
        options={[{ value: 'round', label: t('superset.restRound') }, { value: 'between', label: t('superset.restBetween') }]}
      />
      {rest.mode === 'between' ? (
        <Stepper layout="row" label={t('superset.betweenLabel')} value={rest.betweenSec} display={formatClock(rest.betweenSec)} step={5} min={5} max={180} onChange={(betweenSec) => save({ mode: 'between', betweenSec })} />
      ) : null}
    </> : null}
    {hasNext ? <ActionButton icon="link" label={t(groupId ? 'superset.addNext' : 'superset.link')} secondary onPress={() => void linkWithNext(exercise.entryId).then(onChanged)} /> : null}
    {groupId ? <ActionButton icon="unlink" label={t('superset.unlink')} secondary onPress={() => void unlinkEntry(exercise.entryId).then(onChanged)} /> : null}
  </>;
}
