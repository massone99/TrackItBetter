import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { loadCell } from '../session/SetEntry';
import { ActionButton, Body, Label, ListGroup, ListRow, Sheet } from '../../shared/components/ui';
import { formatClock, formatNumber } from '../../shared/utils/format';
import { listLinkableSets, type LinkableSet, type PoseLink } from './repository';

/** "Set 2 L", "Warm-up": how a set reads in a link. */
export function setName(set: { number: number | null; side: string }, t: (key: string, options?: Record<string, unknown>) => string): string {
  const side = set.side === 'left' ? ' L' : set.side === 'right' ? ' R' : '';
  return set.number === null ? `${t('poseLink.warmup')}${side}` : `${t('poseLink.set', { number: set.number })}${side}`;
}

/** "Archer Pull-up · Set 2 L · 3 Oct", or null when the analysis is not linked. */
export function describeLink(link: PoseLink | null, t: (key: string, options?: Record<string, unknown>) => string, locale: string): string | null {
  if (!link) return null;
  if (!link.set) return link.exerciseName;
  const date = link.set.workoutStartedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${link.exerciseName} · ${setName(link.set, t)} · ${date}`;
}

function setValue(set: LinkableSet): string {
  const base = set.durationSec !== null ? formatClock(set.durationSec) : set.distanceM !== null ? `${formatNumber(set.distanceM)} m` : String(set.reps ?? 0);
  return set.addedLoadKg !== 0 ? `${base} · ${loadCell(set.addedLoadKg)} kg` : base;
}

/**
 * Chooses what an analysis belongs to: first the exercise, then one of its sets from recent workouts
 * (or none). Opens on the set list when an exercise is already chosen.
 */
export function PoseLinkSheet({ visible, value, onChange, onClose }: {
  visible: boolean;
  value: PoseLink | null;
  onChange: (link: PoseLink | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [exercise, setExercise] = useState<{ id: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [sets, setSets] = useState<LinkableSet[] | null>(null);
  const [opened, setOpened] = useState(false);

  // Each opening starts from the current link: its exercise's sets, or the exercise list.
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setExercise(value ? { id: value.exerciseId, name: value.exerciseName } : null);
      setPicking(!value);
      setSets(null);
    }
  }

  useEffect(() => {
    if (!visible || !exercise) return;
    let mounted = true;
    void listLinkableSets(exercise.id).then((rows) => { if (mounted) setSets(rows); });
    return () => { mounted = false; };
  }, [visible, exercise]);

  const choose = (set: LinkableSet | null) => {
    if (!exercise) return;
    onChange({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      set: set ? { id: set.id, number: set.number, side: set.side, workoutId: set.workoutId, workoutStartedAt: set.workoutStartedAt } : null,
    });
    onClose();
  };

  const workouts = [...new Map((sets ?? []).map((set) => [set.workoutId, set.workoutStartedAt] as const))];
  return (
    <>
      <ExercisePicker
        visible={visible && picking}
        title={t('poseLink.chooseExercise')}
        subtitle={t('poseLink.hint')}
        onChoose={(choice) => { setExercise({ id: choice.id, name: choice.name }); setSets(null); setPicking(false); }}
        onClose={() => { if (exercise) setPicking(false); else onClose(); }}
      />
      <Sheet visible={visible && !picking && exercise !== null} onClose={onClose} title={exercise?.name ?? t('poseLink.title')} body={t('poseLink.pickSet')}>
        <ListGroup>
          <ListRow icon="barbell-outline" title={t('poseLink.wholeExercise')} selected={value?.exerciseId === exercise?.id && !value?.set} onPress={() => choose(null)} />
        </ListGroup>
        {sets !== null && sets.length === 0 ? <Body>{t('poseLink.noSets')}</Body> : null}
        {workouts.map(([workoutId, startedAt]) => (
          <View key={workoutId} style={styles.group}>
            <Label>{startedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}</Label>
            <ListGroup>
              {(sets ?? []).filter((set) => set.workoutId === workoutId).map((set) => (
                <ListRow
                  key={set.id}
                  title={setName(set, t)}
                  subtitle={set.done ? setValue(set) : `${setValue(set)} · ${t('poseLink.notDone')}`}
                  selected={value?.set?.id === set.id}
                  onPress={() => choose(set)}
                />
              ))}
            </ListGroup>
          </View>
        ))}
        <ActionButton icon="swap-horizontal" label={t('poseLink.changeExercise')} secondary onPress={() => setPicking(true)} />
        {value ? <ActionButton icon="close-circle-outline" label={t('poseLink.unlink')} variant="ghost" onPress={() => { onChange(null); onClose(); }} /> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
});
