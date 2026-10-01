import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { estimateRoutineSeconds } from '../../src/domain/mobilityPlan';
import { listMobilityRoutines, type MobilityRoutine } from '../../src/features/mobility/routines';
import { getMobilityCycles, getMobilityWeek } from '../../src/features/analytics/repository';
import type { ExerciseCycle, MobilityWeek } from '../../src/features/analytics/mobility';
import { formatMinutes } from '../../src/shared/utils/format';
import { ActionButton, EmptyState, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Text } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

export default function MobilityHubScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [routines, setRoutines] = useState<MobilityRoutine[] | null>(null);
  const [week, setWeek] = useState<MobilityWeek | null>(null);
  const [cycles, setCycles] = useState<ExerciseCycle[]>([]);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void listMobilityRoutines().then((items) => { if (mounted) setRoutines(items); });
    void getMobilityWeek().then((summary) => { if (mounted) setWeek(summary); }).catch(() => undefined);
    void getMobilityCycles().then((items) => { if (mounted) setCycles(items); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []));

  return (
    <Screen>
      <PageHeading
        title={t('mobility.title')}
        subtitle={t('mobility.subtitle')}
        action={<IconButton icon="add" tone="accent" label={t('mobility.newRoutine')} onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } })} />}
      />

      {week ? (
        <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.weekItem}>
            <Text style={styles.weekValue}>{formatMinutes(week.seconds)}</Text>
            <Text style={[styles.weekLabel, { color: palette.textMuted }]}>{t('mobilityStats.hubTime')}</Text>
          </View>
          <View style={[styles.weekDivider, { backgroundColor: palette.border }]} />
          <View style={styles.weekItem}>
            <Text style={styles.weekValue}>{week.sessions}</Text>
            <Text style={[styles.weekLabel, { color: palette.textMuted }]}>{t('mobilityStats.hubSessions', { count: week.sessions })}</Text>
          </View>
        </View>
      ) : null}

      {cycles.length > 0 ? (
        <>
          <SectionTitle title={t('exerciseCycle.hubTitle')} />
          <ListGroup>
            {cycles.map((cycle) => (
              <ListRow
                key={cycle.exerciseId}
                icon={cycle.seconds !== null ? 'timer-outline' : 'repeat'}
                title={cycle.exerciseName}
                subtitle={[
                  cycle.seconds !== null ? formatMinutes(cycle.seconds) : t('exerciseCycle.sets', { count: cycle.sets }),
                  t('mobilityStats.sessionsCount', { count: cycle.sessions }),
                  t('exerciseCycle.dayOf', { day: cycle.day, start: cycle.start.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }) }),
                ].join(' · ')}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: cycle.exerciseId } })}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t('mobility.routines')} />
      {routines && routines.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title={t('mobility.emptyTitle')}
          body={t('mobility.emptyBody')}
          action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('mobility.newRoutine')} onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } })} /></View>}
        />
      ) : null}
      {routines?.map((routine) => {
        const minutes = Math.max(1, Math.round(estimateRoutineSeconds(routine) / 60));
        return (
          <View key={routine.id} style={[styles.routine, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('mobility.edit')} ${routine.name}`}
              onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: routine.id } })}
              style={styles.routineCopy}
            >
              <Text style={styles.routineName}>{routine.name}</Text>
              <Text style={[styles.routineMeta, { color: palette.textMuted }]}>
                {t('mobility.drills', { count: routine.steps.length })} · {t('mobility.minutes', { count: minutes })}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('mobility.start')} ${routine.name}`}
              onPress={() => router.push({ pathname: '/mobility/play/[id]', params: { id: routine.id } })}
              style={({ pressed }) => [styles.play, { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 }]}
            >
              <Icon name="play" size={20} color={palette.accentText} />
            </Pressable>
          </View>
        );
      })}

      <SectionTitle title={t('mobility.tests')} />
      <ListGroup>
        <ListRow icon="analytics-outline" title={t('mobility.tests')} subtitle={t('mobility.testsBody')} onPress={() => router.push('/mobility/tests')} />
        {Platform.OS === 'web' ? null : (
          <ListRow icon="scan-outline" title={t('mobility.poseTitle')} subtitle={t('mobility.poseBody')} onPress={() => router.push('/pose')} />
        )}
      </ListGroup>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  week: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  weekItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  weekValue: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  weekLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  weekDivider: { width: StyleSheet.hairlineWidth },
  routine: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 12, paddingVertical: 16 },
  routineCopy: { flex: 1, gap: 3, paddingVertical: 4 },
  routineName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  routineMeta: { fontFamily: fonts.body, fontSize: 14 },
  play: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
