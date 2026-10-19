import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyWorkoutToPrescription, prescriptionChanges, type PrescribedMatch } from '../../domain/prescriptionSync';
import type { WorkoutExerciseLike } from '../../domain/userProgram';
import { ActionButton, Body, Sheet } from '../../shared/components/ui';
import { listExercises } from '../exercises/repository';
import { getUserProgram, saveUserProgram } from './userPrograms';

/**
 * Offers to take a workout done back into the prescribed workout it came from. `structure` (offered when
 * a workout ends) follows the exercises, their order and set counts; `values` (from a past workout) also
 * takes the targets, loads and rest done.
 */
export function PrescriptionSyncSheet({ visible, match, exercises, mode, onClose }: {
  visible: boolean;
  match: PrescribedMatch | null;
  exercises: readonly WorkoutExerciseLike[];
  mode: 'structure' | 'values';
  /** `applied` is true when the prescribed workout was updated. */
  onClose: (applied: boolean) => void;
}) {
  const { t } = useTranslation();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void listExercises().then((list) => { if (mounted) setNames(new Map(list.map((item) => [item.id, item.name]))); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [visible]);

  if (!match) return null;
  const changes = prescriptionChanges(match.session, exercises);
  const name = (id: string) => names.get(id) ?? id;
  const join = (ids: string[]) => ids.map(name).join(', ');
  const lines = [
    changes.added.length ? t('prescriptionSync.added', { list: join(changes.added) }) : null,
    changes.removed.length ? t('prescriptionSync.removed', { list: join(changes.removed) }) : null,
    changes.reordered ? t('prescriptionSync.reordered') : null,
    changes.setsChanged.length ? t('prescriptionSync.sets', { list: join(changes.setsChanged) }) : null,
    mode === 'values' && changes.valuesChanged.length ? t('prescriptionSync.values', { list: join(changes.valuesChanged) }) : null,
  ].filter((line): line is string => line !== null);

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const program = await getUserProgram(match.program.id);
      const current = program?.sessions.find((session) => session.id === match.session.id);
      if (!program || !current) throw new Error('Prescribed workout not found');
      const updated = applyWorkoutToPrescription(current, exercises, mode, () => Crypto.randomUUID());
      await saveUserProgram({ id: program.id, name: program.name, sessions: program.sessions.map((session) => (session.id === updated.id ? updated : session)) });
      onClose(true);
    } catch {
      setError(t('prescriptionSync.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => onClose(false)}
      title={t('prescriptionSync.title', { name: match.session.name })}
      body={t(mode === 'values' ? 'prescriptionSync.bodyValues' : 'prescriptionSync.bodyStructure', { program: match.program.name, workout: match.session.name })}
    >
      {lines.length === 0 ? <Body>{t('prescriptionSync.noChanges')}</Body> : lines.map((line) => <Body key={line}>{`• ${line}`}</Body>)}
      {error ? <Body>{error}</Body> : null}
      <ActionButton icon="checkmark" label={busy ? t('programBuilder.starting') : t('prescriptionSync.update')} disabled={busy || (lines.length === 0 && mode === 'structure')} onPress={() => void apply()} />
      <ActionButton label={t(mode === 'values' ? 'common.cancel' : 'prescriptionSync.notNow')} secondary onPress={() => onClose(false)} />
    </Sheet>
  );
}
