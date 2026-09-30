import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DEFAULT_PREP_SEC, estimateRoutineSeconds, type MobilityStep } from '../../../src/domain/mobilityPlan';
import { ExercisePicker } from '../../../src/features/exercises/ExercisePicker';
import { listExercises } from '../../../src/features/exercises/repository';
import { deleteMobilityRoutine, getMobilityRoutine, newStep, saveMobilityRoutine } from '../../../src/features/mobility/routines';
import {
  ActionButton,
  Body,
  Card,
  EmptyState,
  IconButton,
  PageHeading,
  Screen,
  SectionTitle,
  SegmentedControl,
  Sheet,
  Stepper,
  SwitchRow,
  Text,
  TextField,
} from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { goBack } from '../../../src/shared/navigation/goBack';

type ExerciseInfo = { name: string; metric: string };

export default function RoutineBuilderScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [transitionSec, setTransitionSec] = useState(10);
  const [prepSec, setPrepSec] = useState(DEFAULT_PREP_SEC);
  const [steps, setSteps] = useState<MobilityStep[]>([]);
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exercise names are reloaded on focus so drills created from the picker show up by name.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const exercises = await listExercises();
      if (!mounted) return;
      setExerciseInfo(new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, metric: exercise.metric }])));
      if (!isNew && !loaded) {
        const routine = await getMobilityRoutine(id);
        if (!mounted) return;
        if (routine) {
          setName(routine.name);
          setTransitionSec(routine.transitionSec);
          setPrepSec(routine.prepSec);
          setSteps(routine.steps);
        }
        setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [id, isNew, loaded]));

  const updateStep = (stepId: string, patch: Partial<MobilityStep>) => {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  };
  const moveStep = (index: number, delta: number) => {
    setSteps((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim() || steps.length === 0) { setError(t('mobility.invalid')); return; }
    try {
      await saveMobilityRoutine({ id: isNew ? undefined : id, name, transitionSec, prepSec, steps });
      goBack('/mobility');
    } catch {
      setError(t('mobility.invalid'));
    }
  };

  if (!loaded) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const minutes = Math.max(1, Math.round(estimateRoutineSeconds({ transitionSec, prepSec, steps }) / 60));
  return (
    <Screen>
      <PageHeading title={isNew ? t('mobility.builderNew') : name || t('mobility.builderTitle')} subtitle={steps.length ? t('mobility.estimated', { count: minutes }) : undefined} />
      <TextField label={t('mobility.name')} value={name} onChangeText={(value) => { setName(value); setError(null); }} placeholder={t('mobility.namePlaceholder')} maxLength={60} />
      <Card style={styles.transitionCard}>
        <Stepper layout="row" label={t('mobility.prep')} value={prepSec} display={prepSec === 0 ? t('mobility.prepOff') : t('mobility.seconds', { count: prepSec })} step={1} min={0} max={30} onChange={setPrepSec} />
        <Body style={styles.prepHint}>{t('mobility.prepHint')}</Body>
        <Stepper layout="row" label={t('mobility.transition')} value={transitionSec} display={t('mobility.seconds', { count: transitionSec })} step={5} min={0} max={60} onChange={setTransitionSec} />
      </Card>

      <SectionTitle title={t('mobility.drillsTitle')} />
      {steps.length === 0 ? (
        <EmptyState icon="list-outline" title={t('mobility.addDrill')} body={t('mobility.emptyBody')} />
      ) : null}
      {steps.map((step, index) => (
        <Card key={step.id} style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNumber, { backgroundColor: palette.accentSoft }]}>
              <Text style={[styles.stepNumberText, { color: palette.accentStrong }]}>{index + 1}</Text>
            </View>
            <Text style={styles.stepName} numberOfLines={2}>{exerciseInfo.get(step.exerciseId)?.name ?? '…'}</Text>
            <IconButton icon="chevron-up" label={t('mobility.moveUp')} tone="plain" size={34} onPress={() => { if (index > 0) moveStep(index, -1); }} />
            <IconButton icon="chevron-down" label={t('mobility.moveDown')} tone="plain" size={34} onPress={() => { if (index < steps.length - 1) moveStep(index, 1); }} />
            <IconButton icon="trash-outline" label={t('mobility.removeDrill')} tone="plain" size={34} onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))} />
          </View>
          <SegmentedControl
            value={step.mode}
            onChange={(mode) => updateStep(step.id, { mode })}
            options={[{ value: 'hold', label: t('mobility.hold') }, { value: 'reps', label: t('mobility.reps') }]}
          />
          <View style={styles.steppers}>
            {step.mode === 'hold' ? (
              <Stepper layout="row" label={t('mobility.hold')} value={step.seconds} display={t('mobility.seconds', { count: step.seconds })} step={5} min={5} max={600} onChange={(seconds) => updateStep(step.id, { seconds })} />
            ) : (
              <Stepper layout="row" label={t('mobility.reps')} value={step.reps} step={1} min={1} max={100} onChange={(reps) => updateStep(step.id, { reps })} />
            )}
            <Stepper layout="row" label={t('mobility.rounds')} value={step.rounds} step={1} min={1} max={10} onChange={(rounds) => updateStep(step.id, { rounds })} />
            <Stepper layout="row" label={t('mobility.rest')} value={step.restSec} display={t('mobility.seconds', { count: step.restSec })} step={5} min={0} max={300} onChange={(restSec) => updateStep(step.id, { restSec })} />
          </View>
          <View style={[styles.sideRow, { borderTopColor: palette.border }]}>
            <SwitchRow title={t('mobility.perSide')} value={step.perSide} onChange={(perSide) => updateStep(step.id, { perSide })} />
          </View>
        </Card>
      ))}
      <ActionButton icon="add" label={t('mobility.addDrill')} secondary onPress={() => setPickerOpen(true)} />

      {error ? <Text style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}
      <ActionButton icon="checkmark" label={t('mobility.save')} onPress={() => void save()} />
      {isNew ? null : <ActionButton icon="trash-outline" label={t('mobility.delete')} variant="danger" onPress={() => setConfirmDelete(true)} />}

      <ExercisePicker
        visible={pickerOpen}
        title={t('mobility.pickDrill')}
        initialCategory="mobility"
        onChoose={(choice) => {
          setPickerOpen(false);
          setError(null);
          setSteps((current) => [...current, newStep(choice.id, choice.metric === 'time' || choice.metric === 'time_load' ? 'hold' : 'reps')]);
        }}
        onCreate={(name) => { setPickerOpen(false); router.push({ pathname: '/exercise/new', params: name ? { name } : {} }); }}
        onClose={() => setPickerOpen(false)}
      />

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('mobility.delete')} body={t('mobility.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => void deleteMobilityRoutine(id).then(() => goBack('/mobility'))} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  transitionCard: { paddingVertical: 8 },
  prepHint: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  stepCard: { gap: 12, paddingBottom: 6 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepNumber: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  stepNumberText: { fontFamily: fonts.display, fontSize: 16 },
  stepName: { flex: 1, fontFamily: fonts.display, fontSize: 21, lineHeight: 24 },
  steppers: { gap: 2 },
  sideRow: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -18 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
