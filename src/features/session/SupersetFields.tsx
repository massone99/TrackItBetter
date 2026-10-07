import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuGroup, MenuRow, SegmentedControl } from '../../shared/components/ui';
import { DurationField } from '../../shared/components/DateTimePickers';
import { formatClock } from '../../shared/utils/format';
import { linkWithNext, setSupersetRest, unlinkEntry, type SessionExercise } from './repository';
import { parseSupersetType, type SupersetRest } from './superset';

/** Rest mode of the superset this exercise is in; nothing when it is not linked. */
export function SupersetSettings({ exercise }: { exercise: SessionExercise }) {
  const { t } = useTranslation();
  const [rest, setRest] = useState<SupersetRest>(() => parseSupersetType(exercise.groupType));
  const groupId = exercise.groupId;
  const save = (next: SupersetRest) => {
    setRest(next);
    if (groupId) void setSupersetRest(groupId, next);
  };
  if (!groupId) return null;
  return (
    <MenuGroup title={t('superset.title')}>
      <SegmentedControl<SupersetRest['mode']>
        value={rest.mode}
        onChange={(mode) => save({ mode, betweenSec: mode === 'between' ? rest.betweenSec || 30 : 0 })}
        options={[{ value: 'round', label: t('superset.restRound') }, { value: 'between', label: t('superset.restBetween') }]}
      />
      {rest.mode === 'between' ? (
        <DurationField label={t('superset.betweenLabel')} value={rest.betweenSec} format={formatClock} step={5} min={5} max={180} presets={[15, 30, 60, 90]} onChange={(betweenSec) => save({ mode: 'between', betweenSec })} />
      ) : null}
    </MenuGroup>
  );
}

/** Link with the next exercise / unlink, as rows of the exercise menu. */
export function SupersetActions({ exercise, hasNext, onChanged }: { exercise: SessionExercise; hasNext: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const groupId = exercise.groupId;
  return <>
    {hasNext ? <MenuRow icon="link" label={t(groupId ? 'superset.addNext' : 'superset.link')} onPress={() => void linkWithNext(exercise.entryId).then(onChanged)} /> : null}
    {groupId ? <MenuRow icon="unlink" label={t('superset.unlink')} onPress={() => void unlinkEntry(exercise.entryId).then(onChanged)} /> : null}
  </>;
}
