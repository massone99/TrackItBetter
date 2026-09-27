import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../../src/shared/components/Text';
import { getCompletedWorkout, updateCompletedWorkoutSet, updateSetNote, updateSetRpe } from '../../../src/features/session/repository';
import { RpePicker } from '../../../src/features/session/RpePicker';
import { formatRpe } from '../../../src/domain/rpe';
import type { CompletedWorkout } from '../../../src/features/session/repository';
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen, Icon, Sheet, TextField } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { goBack } from '../../../src/shared/navigation/goBack';

export default function PastWorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [noteFor, setNoteFor] = useState<{ id: string; index: number; note: string | null; rpe: number | null; exerciseName: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setWorkout(await getCompletedWorkout(id));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reloads on focus so clips added on the form-check screen show up when returning.
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const adjust = async (setId: string, field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg', value: number) => {
    try {
      await updateCompletedWorkoutSet(id, setId, field, value);
      setError(null);
      await refresh();
    } catch {
      setError(t('history.saveError'));
    }
  };

  if (loading) return <Screen><PageHeading title={t('history.title')} subtitle={t('history.loading')} /></Screen>;
  if (loadError) return <Screen><PageHeading title={t('history.title')} subtitle={t('history.loadError')} /><ActionButton label={t('history.retry')} onPress={() => { setLoading(true); void refresh(); }} /><ActionButton label={t('history.back')} secondary onPress={() => goBack('/(tabs)/log')} /></Screen>;
  if (!workout) return <Screen><PageHeading title={t('history.unavailable')} subtitle={t('history.unavailableBody')} /><ActionButton label={t('history.back')} onPress={() => goBack('/(tabs)/log')} /></Screen>;

  const duration = Math.max(0, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-US';
  return (
    <Screen>
      <PageHeading title={workout.name} subtitle={t('history.subtitle', { date: workout.startedAt.toLocaleString(locale), duration, unit: t('history.minutes'), status: t('history.completed') })} />
      <ActionButton label={t('shareCard.action')} secondary onPress={() => router.push({ pathname: '/workout/share/[id]', params: { id } })} />
      <Body>{t('history.editHelp')}</Body>
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      {workout.exercises.map((exercise) => {
        const timed = exercise.metric === 'time' || exercise.metric === 'time_load';
        const distance = exercise.metric === 'distance';
        const loaded = exercise.metric === 'reps_load' || exercise.metric === 'time_load';
        const metricField = timed ? 'durationSec' : distance ? 'distanceM' : 'reps';
        const step = distance ? 0.1 : 1;
        return (
          <Card key={exercise.entryId}>
            <Label>{t(`metric.${exercise.metric}`)}</Label>
            <Heading>{exercise.name}</Heading>
            {exercise.sets.map((set) => {
              const value = timed ? set.durationSec ?? 0 : distance ? set.distanceM ?? 0 : set.reps ?? 0;
              const unit = timed ? t('history.units.seconds') : distance ? t('history.units.meters') : t('history.units.reps');
              return (
                <View key={set.id} style={[styles.setBlock, { borderColor: palette.border }]}>
                <View style={styles.row}>
                  <View style={styles.setMeta}>
                    <Text style={{ color: palette.textMuted, fontWeight: '800' }}>{t('history.set', { number: set.index })}</Text>
                    <Text style={{ color: set.completedAt ? palette.accentStrong : palette.textMuted, fontSize: 11 }}>{set.completedAt ? t('history.setCompleted') : t('history.setIncomplete')}</Text>
                  </View>
                  <View style={styles.counter}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('history.decrease', { unit })} onPress={() => void adjust(set.id, metricField, Math.max(0, Math.round((value - step) * 100) / 100))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="remove" size={16} color={palette.text} /></Pressable>
                    <Text style={{ color: palette.text, minWidth: 58, textAlign: 'center', fontWeight: '800' }}>{value} {unit}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('history.increase', { unit })} onPress={() => void adjust(set.id, metricField, Math.round((value + step) * 100) / 100)} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="add" size={16} color={palette.text} /></Pressable>
                  </View>
                  {loaded ? <LoadEditor key={`${set.id}-${set.addedLoadKg}`} value={set.addedLoadKg} onSave={(next) => void adjust(set.id, 'addedLoadKg', next)} palette={palette} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('formCheck.open')}
                    onPress={() => router.push({ pathname: '/form-check/[setId]', params: { setId: set.id } })}
                    style={[styles.videoButton, { backgroundColor: palette.surfaceMuted }]}
                  ><Icon name="videocam-outline" size={18} color={palette.accentStrong} /></Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setNoteFor({ id: set.id, index: set.index, note: set.note, rpe: set.rpe, exerciseName: exercise.name })}
                  style={styles.noteRow}
                >
                  <Icon name={set.note ? 'chatbubble-ellipses-outline' : 'add'} size={14} color={set.note ? palette.textMuted : palette.accentStrong} />
                  <Text numberOfLines={2} style={[styles.noteText, { color: set.note ? palette.textMuted : palette.accentStrong }]}>{[set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : null, set.note ?? (set.rpe === null ? `${t('logger.rpe')} · ${t('logger.noteLabel')}` : null)].filter(Boolean).join(' · ')}</Text>
                  {set.clipCount > 0 ? (
                    <View style={[styles.clipChip, { backgroundColor: palette.accentSoft }]}>
                      <Icon name="videocam" size={12} color={palette.accentStrong} />
                      <Text style={[styles.clipText, { color: palette.accentStrong }]}>{t('logger.clip', { count: set.clipCount })}</Text>
                    </View>
                  ) : null}
                </Pressable>
                </View>
              );
            })}
          </Card>
        );
      })}
      {noteFor ? (
        <NoteSheet
          key={noteFor.id}
          title={`${noteFor.exerciseName} · ${t('logger.setTitle', { number: noteFor.index })}`}
          initial={noteFor.note ?? ''}
          initialRpe={noteFor.rpe}
          onRpe={async (rpe) => { await updateSetRpe(noteFor.id, rpe); await refresh(); }}
          onClose={() => setNoteFor(null)}
          onSave={async (note) => { setNoteFor(null); await updateSetNote(noteFor.id, note); await refresh(); }}
        />
      ) : null}
    </Screen>
  );
}

function NoteSheet({ title, initial, initialRpe, onRpe, onClose, onSave }: {
  title: string;
  initial: string;
  initialRpe: number | null;
  onRpe: (rpe: number | null) => Promise<void>;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initial);
  const [rpe, setRpe] = useState(initialRpe);
  return (
    <Sheet visible onClose={onClose} title={title}>
      <RpePicker value={rpe} onChange={(next) => { setRpe(next); void onRpe(next); }} />
      <TextField label={t('logger.noteLabel')} value={note} onChangeText={setNote} placeholder={t('logger.notePlaceholder')} multiline maxLength={500} />
      <ActionButton label={t('common.save')} onPress={() => void onSave(note)} />
    </Sheet>
  );
}

function LoadEditor({ value, onSave, palette }: { value: number; onSave: (value: number) => void; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  return <View style={styles.loadWrap}>
    <TextInput
      accessibilityLabel={t('history.addedLoad')}
      keyboardType="numbers-and-punctuation"
      value={draft}
      onChangeText={setDraft}
      onEndEditing={() => {
        const parsed = Number(draft.replace(',', '.'));
        if (draft.trim() !== '' && Number.isFinite(parsed)) onSave(parsed);
        else setDraft(String(value));
      }}
      style={[styles.loadInput, { backgroundColor: palette.surfaceMuted, color: palette.text }]}
    />
    <Text style={{ color: palette.textMuted, fontSize: 11 }}>{t('history.units.kg')}</Text>
  </View>;
}

const baseStyles = StyleSheet.create({
  setBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, paddingBottom: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  noteText: { flex: 1, fontSize: 13 },
  clipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 999 },
  clipText: { fontSize: 12, fontWeight: '600' },
  setMeta: { flex: 1, gap: 3 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adjust: { width: 34, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  loadWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loadInput: { width: 62, height: 38, borderRadius: 10, textAlign: 'center', fontWeight: '700' },
  videoButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
