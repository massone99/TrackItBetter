import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SetBand } from '../../domain/equipment';
import { ActionButton } from '../../shared/components/ui';
import { setEntryBands, setSetBands, type SessionExercise, type SessionSet } from '../session/repository';
import { BandsPicker } from './BandsPicker';
import { bandsById, useEquipment } from './useEquipment';

/**
 * Resistance bands that help one set (see BandsPicker): the choice is saved with the set, with the
 * assistance in kg worked out at that moment, and can be given to the other sets of the exercise.
 */
export function SetBandsField({ exercise, set, onChanged }: { exercise: SessionExercise; set: SessionSet; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const { catalog } = useEquipment();
  const [bands, setBands] = useState<SetBand[]>(set.bands);
  const [applied, setApplied] = useState<'remaining' | 'all' | null>(null);
  if (!catalog) return null;
  const byId = bandsById(catalog);

  const save = (next: SetBand[]) => {
    setBands(next);
    setApplied(null);
    void setSetBands(set.id, next, byId).then(onChanged);
  };
  const applyToRemaining = () => {
    const later = exercise.sets.filter((item) => item.index > set.index && !item.completedAt);
    setApplied('remaining');
    void Promise.all(later.map((item) => setSetBands(item.id, bands, byId))).then(onChanged);
  };
  // Every set of this exercise in this workout, done or not (also in a workout already finished).
  const applyToAll = () => {
    setApplied('all');
    void setEntryBands(exercise.entryId, bands, byId).then(onChanged);
  };

  return (
    <BandsPicker bands={bands} onChange={save}>
      {bands.length > 0 && exercise.sets.length > 1 ? (
        <ActionButton icon={applied === 'all' ? 'checkmark' : 'copy-outline'} label={applied === 'all' ? t('bands.appliedAll') : t('bands.applyAll')} variant="ghost" onPress={applyToAll} />
      ) : null}
      {bands.length > 0 && exercise.sets.some((item) => item.index > set.index && !item.completedAt) ? (
        <ActionButton icon={applied === 'remaining' ? 'checkmark' : 'copy-outline'} label={applied === 'remaining' ? t('bands.applied') : t('bands.applyRemaining')} variant="ghost" onPress={applyToRemaining} />
      ) : null}
    </BandsPicker>
  );
}
