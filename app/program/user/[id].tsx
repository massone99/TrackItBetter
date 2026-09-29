import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { estimateSessionSeconds, nextSessionInRotation, sessionSetCount, type UserProgram, type UserProgramSession } from '../../../src/domain/userProgram';
import { listExercises } from '../../../src/features/exercises/repository';
import { describePrescription } from '../../../src/features/programs/describe';
import { startUserProgramSession } from '../../../src/features/programs/startUserSession';
import { deleteUserProgram, duplicateUserProgram, getUserProgram } from '../../../src/features/programs/userPrograms';
import { getActiveWorkout, listRecentWorkoutNames } from '../../../src/features/session/repository';
import { ActionButton, Body, Card, IconButton, Label, PageHeading, Screen, SectionTitle, Sheet, Text } from '../../../src/shared/components/ui';
import { goBack } from '../../../src/shared/navigation/goBack';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { formatMinutes } from '../../../src/shared/utils/format';

type ExerciseInfo = { name: string; metric: string };

export default function UserProgramScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [recentNames, setRecentNames] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([getUserProgram(id), listExercises(), getActiveWorkout(), listRecentWorkoutNames()]).then(([found, exercises, active, names]) => {
      if (!mounted) return;
      setRecentNames(names);
      setProgram(found);
      setInfo(new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, metric: exercise.metric }])));
      setActiveName(active?.name ?? null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [id]));

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!program) {
    return (
      <Screen>
        <PageHeading title={t('userProgram.notFound')} />
        <ActionButton label={t('userProgram.allPrograms')} onPress={() => router.replace('/programs')} />
      </Screen>
    );
  }

  const metricById = new Map([...info].map(([exerciseId, item]) => [exerciseId, item.metric]));
  const nextId = nextSessionInRotation(program, recentNames).id;

  const start = async (session: UserProgramSession) => {
    if (starting) return;
    setStarting(session.id);
    setError(null);
    try {
      const workoutId = await startUserProgramSession(program, session);
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch {
      setError(t('programBuilder.startError'));
    } finally {
      setStarting(null);
    }
  };

  const duplicate = async () => {
    const copy = await duplicateUserProgram(program.id, t('userProgram.copyName', { name: program.name }));
    if (copy) router.replace({ pathname: '/program/user/[id]', params: { id: copy.id } });
  };

  return (
    <Screen>
      <PageHeading
        title={program.name}
        subtitle={t('userProgram.daysPerWeek', { count: program.sessions.length })}
        action={
          <View style={styles.actions}>
            <IconButton icon="copy-outline" label={t('userProgram.duplicate')} onPress={() => void duplicate()} />
            <IconButton icon="create-outline" tone="accent" label={t('programBuilder.edit')} onPress={() => router.push({ pathname: '/program-builder', params: { id: program.id } })} />
          </View>
        }
      />

      {activeName ? <Body>{t('userProgram.activeWorkout', { name: activeName })}</Body> : null}
      {error ? <Text style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}

      <Body>{t('userProgram.rotationHelp')}</Body>
      <SectionTitle title={t('userProgram.daysTitle')} />
      {program.sessions.map((session, index) => (
        <Card key={session.id} style={[styles.session, session.id === nextId && { borderColor: palette.accentStrong }]}>
          <View style={styles.sessionHead}>
            <View style={styles.flex}>
              <Label style={session.id === nextId ? { color: palette.accentStrong } : undefined}>
                {session.id === nextId ? `${t('userProgram.dayNumber', { number: index + 1 })} · ${t('userProgram.nextLabel')}` : t('userProgram.dayNumber', { number: index + 1 })}
              </Label>
              <Text style={styles.sessionName}>{session.name}</Text>
            </View>
            <Label>{t('userProgram.daySummary', { count: sessionSetCount(session), minutes: formatMinutes(estimateSessionSeconds(session, metricById)) })}</Label>
          </View>
          {session.exercises.map((prescription) => (
            <View key={prescription.id} style={[styles.exerciseRow, { borderTopColor: palette.border }]}>
              <Text style={styles.exerciseName} numberOfLines={2}>{info.get(prescription.exerciseId)?.name ?? t('userProgram.exerciseMissing')}</Text>
              <Text style={[styles.target, { color: palette.textMuted }]}>{describePrescription(prescription, metricById.get(prescription.exerciseId), t)}</Text>
            </View>
          ))}
          <ActionButton
            icon="play"
            label={starting === session.id ? t('programBuilder.starting') : t('userProgram.start')}
            secondary={session.id !== nextId}
            disabled={starting !== null || activeName !== null}
            onPress={() => void start(session)}
          />
        </Card>
      ))}

      <ActionButton icon="trash-outline" label={t('programBuilder.delete')} variant="danger" onPress={() => setConfirmDelete(true)} />

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('programBuilder.deleteTitle')} body={t('programBuilder.deleteBody', { name: program.name })}>
        <ActionButton icon="trash-outline" label={t('programBuilder.delete')} variant="danger" onPress={() => {
          setConfirmDelete(false);
          void deleteUserProgram(program.id).then(() => goBack('/programs'));
        }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  session: { gap: 12 },
  sessionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sessionName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  exerciseRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 15 },
  target: { fontFamily: fonts.medium, fontSize: 14 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
