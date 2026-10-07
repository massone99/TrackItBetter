import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, MenuGroup } from '../../shared/components/ui';
import { formatNumber } from '../../shared/utils/format';
import { FormRating } from './LastTime';
import { setEntryAverages, type SessionExercise } from './repository';
import { RpePicker } from './RpePicker';

const averageOf = (values: (number | null)[]) => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.round((known.reduce((sum, value) => sum + value, 0) / known.length) * 10) / 10 : null;
};
/** The value when every set has the same one, so the picker shows it as chosen. */
const sharedValue = (values: (number | null)[]) => (values.length > 0 && values.every((value) => value === values[0]) ? values[0] : null);

/**
 * Average RPE and form of an exercise in a finished workout, set by hand: the chosen value goes to
 * every completed working set, so statistics and "vs last time" read it like any rated set.
 */
export function ExerciseAveragesField({ exercise, onChanged }: { exercise: SessionExercise; onChanged: () => void }) {
  const { t } = useTranslation();
  const working = exercise.sets.filter((set) => set.kind === 'working' && set.completedAt);
  const [rpe, setRpe] = useState(() => sharedValue(working.map((set) => set.rpe)));
  const [form, setForm] = useState(() => sharedValue(working.map((set) => set.formRating)));
  if (working.length === 0) return null;
  const rpeAverage = averageOf(working.map((set) => set.rpe));
  const formAverage = averageOf(working.map((set) => set.formRating));
  const mixed = (rpe === null && rpeAverage !== null) || (form === null && formAverage !== null);
  return (
    <MenuGroup title={t('averages.title')}>
      <Body>{t('averages.help', { count: working.length })}</Body>
      {mixed ? (
        <Body>{t('averages.current', { rpe: rpeAverage === null ? '–' : formatNumber(rpeAverage), form: formAverage === null ? '–' : formatNumber(formAverage) })}</Body>
      ) : null}
      <RpePicker value={rpe} onChange={(next) => { setRpe(next); void setEntryAverages(exercise.entryId, { rpe: next }).then(onChanged); }} />
      <FormRating value={form} onChange={(next) => { setForm(next); void setEntryAverages(exercise.entryId, { formRating: next }).then(onChanged); }} />
    </MenuGroup>
  );
}
