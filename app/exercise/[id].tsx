import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Exercise } from '../../src/db/schema';
import { openReferenceVideo, ReferenceLinkSheet } from '../../src/features/exercises/ReferenceLinkSheet';
import { archiveCustomExercise, getExerciseById, setExerciseFavourite } from '../../src/features/exercises/repository';
import { addExerciseToWorkout, getActiveWorkout, startWorkout } from '../../src/features/session/repository';
import { ActionButton, Body, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet, Text } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { linkHost } from '../../src/shared/utils/url';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { goBack } from '../../src/shared/navigation/goBack';

function readList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export default function ExerciseRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingReference, setEditingReference] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const reload = useCallback(async () => {
    setExercise(await getExerciseById(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const beginWithExercise = async () => {
    if (!exercise) return;
    const active = await getActiveWorkout();
    const workoutId = active?.id ?? await startWorkout();
    await addExerciseToWorkout(workoutId, exercise.id);
    router.push({ pathname: '/workout/[id]', params: { id: workoutId } });
  };

  const archive = async () => {
    if (!exercise) return;
    setConfirmArchive(false);
    await archiveCustomExercise(exercise.id);
    goBack('/(tabs)/library');
  };

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!exercise) return <Screen><PageHeading title={t('details.exercise')} subtitle={t('library.empty')} /></Screen>;

  const cues = readList(exercise.cues);
  const equipment = readList(exercise.equipment);
  const muscles = readList(exercise.primaryMuscles);
  const kind = exercise.level ? t('progression.level', { number: exercise.level }) : exercise.isCustom ? t('exercise.custom') : t('exercise.foundation');
  return (
    <Screen>
      <PageHeading
        title={exercise.name}
        subtitle={[t(`library.category.${exercise.category}`), t(`metric.${exercise.metric}`), kind].join(' · ')}
        action={
          <IconButton
            icon={exercise.favourite ? 'star' : 'star-outline'}
            label={exercise.favourite ? t('library.removeFavourite') : t('library.addFavourite')}
            onPress={() => void setExerciseFavourite(exercise.id, !exercise.favourite).then(reload)}
          />
        }
      />

      <ListGroup>
        {exercise.demoUrl ? (
          <ListRow
            icon="play-circle"
            title={t('logger.referenceOpen')}
            subtitle={linkHost(exercise.demoUrl)}
            onPress={() => openReferenceVideo(exercise.demoUrl!)}
            trailing={<IconButton icon="create-outline" label={t('logger.reference')} tone="plain" size={36} onPress={() => setEditingReference(true)} />}
          />
        ) : (
          <ListRow icon="link" title={t('exercise.addReference')} subtitle={t('logger.referenceHint')} onPress={() => setEditingReference(true)} />
        )}
        {exercise.chainId ? (
          <ListRow icon="git-branch-outline" title={t('exercise.viewProgression')} onPress={() => router.push({ pathname: '/skill/[chainId]', params: { chainId: exercise.chainId! } })} />
        ) : null}
      </ListGroup>

      {cues.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title={t('exercise.coaching')} />
          <View style={[styles.cues, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {cues.map((cue) => (
              <View key={cue} style={styles.cue}>
                <Icon name="checkmark-circle-outline" size={18} color={palette.accentStrong} />
                <Body style={styles.cueText}>{cue}</Body>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {muscles.length > 0 || equipment.length > 0 ? (
        <View style={styles.tags}>
          {muscles.map((muscle) => <Tag key={`m-${muscle}`} icon="body-outline" label={muscle.replaceAll('-', ' ')} />)}
          {equipment.map((item) => <Tag key={`e-${item}`} icon="construct-outline" label={item.replaceAll('-', ' ')} />)}
        </View>
      ) : null}

      <ActionButton icon="add" label={t('exercise.addToWorkout')} onPress={() => void beginWithExercise()} />
      {exercise.isCustom ? (
        <ActionButton icon="archive-outline" label={t('exercise.removeFromLibrary')} variant="danger" onPress={() => setConfirmArchive(true)} />
      ) : null}

      {editingReference ? (
        <ReferenceLinkSheet
          visible
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          currentUrl={exercise.demoUrl}
          onClose={() => setEditingReference(false)}
          onSaved={() => { setEditingReference(false); void reload(); }}
        />
      ) : null}

      <Sheet visible={confirmArchive} onClose={() => setConfirmArchive(false)} title={t('exercise.removeFromLibrary')} body={t('exercise.removeFromLibraryBody')}>
        <ActionButton icon="archive-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => void archive()} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmArchive(false)} />
      </Sheet>
    </Screen>
  );
}

function Tag({ label, icon }: { label: string; icon: 'body-outline' | 'construct-outline' }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: palette.surfaceMuted }]}>
      <Icon name={icon} size={13} color={palette.textMuted} />
      <Text style={[styles.tagText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: 10 },
  cues: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 6 },
  cue: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  cueText: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 30, borderRadius: 999 },
  tagText: { fontFamily: fonts.medium, fontSize: 13, textTransform: 'capitalize' },
});
