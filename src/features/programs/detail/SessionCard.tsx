import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { estimateSessionSeconds, sessionSetCount, type UserProgramSession } from '../../../domain/userProgram';
import { ActionButton, Card, Icon, IconButton, Label, Text } from '../../../shared/components/ui';
import { radii } from '../../../shared/theme/tokens';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { formatMinutes } from '../../../shared/utils/format';
import { openExercisePage } from '../../exercises/openExercise';
import { readDefaultRest } from '../../session/restDefaults';
import { describePrescription } from '../describe';

export type ExerciseInfo = { name: string; metric: string };

export interface SessionViewProps {
  session: UserProgramSession;
  /** "Workout 3": the number shown above the name. */
  number: number;
  isNext: boolean;
  open: boolean;
  starting: string | null;
  info: ReadonlyMap<string, ExerciseInfo>;
  metricById: ReadonlyMap<string, string>;
  onToggle: () => void;
  onMenu: () => void;
  onStart: () => void;
  onLogPast: () => void;
}

/** One workout of the program as a card: folded to its exercise names, open to every prescription. */
export function SessionCard({ session, number, isNext, open, starting, info, metricById, onToggle, onMenu, onStart, onLogPast, handle }: SessionViewProps & { handle?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const nameOf = (exerciseId: string) => info.get(exerciseId)?.name ?? t('userProgram.exerciseMissing');
  return (
    <Card style={[styles.session, isNext && { borderColor: palette.accentStrong }]}>
      <View style={styles.sessionTop}>
        {handle}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? t('userProgram.collapseDay', { name: session.name }) : t('userProgram.expandDay', { name: session.name })}
          onPress={onToggle}
          onLongPress={onMenu}
          accessibilityHint={t('workoutDetails.editHint')}
          accessibilityActions={[{ name: 'longpress', label: t('workoutDetails.editHint') }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onMenu(); }}
          style={styles.sessionHead}
        >
          <View style={styles.flex}>
            <Label style={isNext ? { color: palette.accentStrong } : undefined}>
              {isNext ? `${t('userProgram.dayNumber', { number })} · ${t('userProgram.nextLabel')}` : t('userProgram.dayNumber', { number })}
            </Label>
            <Text style={styles.sessionName}>{session.name}</Text>
            {/* Under the name, not beside it: the name keeps the whole width and never breaks mid-word. */}
            <Label>{t('userProgram.daySummary', { count: sessionSetCount(session), minutes: formatMinutes(estimateSessionSeconds(session, metricById, readDefaultRest('working'))) })}</Label>
          </View>
          <View style={styles.headMeta}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={palette.textMuted} />
          </View>
        </Pressable>
        {open ? null : (
          <IconButton icon="play" tone={isNext ? 'accent' : 'muted'} label={`${t('userProgram.start')} ${session.name}`} disabled={starting !== null} onPress={onStart} />
        )}
      </View>
      {session.notes?.trim() ? <Text style={[styles.target, { color: palette.text }]}>{session.notes.trim()}</Text> : null}
      {open ? session.exercises.map((prescription) => (
        <Pressable
          key={prescription.id}
          accessibilityRole="button"
          accessibilityLabel={nameOf(prescription.exerciseId)}
          accessibilityHint={t('logger.openExerciseHint')}
          onLongPress={() => openExercisePage(prescription.exerciseId)}
          accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(prescription.exerciseId); }}
          style={[styles.exerciseRow, { borderTopColor: palette.border }]}
        >
          <Text style={styles.exerciseName} numberOfLines={2}>{nameOf(prescription.exerciseId)}</Text>
          <Text style={[styles.target, { color: palette.textMuted }]}>{describePrescription(prescription, metricById.get(prescription.exerciseId), t)}</Text>
          {prescription.note?.trim() ? <Text style={[styles.target, { color: palette.text }]}>{prescription.note.trim()}</Text> : null}
        </Pressable>
      )) : (
        <Text numberOfLines={2} style={[styles.target, { color: palette.textMuted }]}>{session.exercises.map((prescription) => nameOf(prescription.exerciseId)).join(' · ')}</Text>
      )}
      {open ? (
        <>
          {/* The next workout starts from the footer; the others from their own card. */}
          {isNext ? null : <ActionButton icon="play" label={starting === session.id ? t('programBuilder.starting') : t('userProgram.start')} secondary disabled={starting !== null} onPress={onStart} />}
          <ActionButton icon="time-outline" label={t('userProgram.logPast')} variant="ghost" disabled={starting !== null} onPress={onLogPast} />
        </>
      ) : null}
    </Card>
  );
}

/** An alternative inside a "pick one" group, or an extra workout: one line with its own start button. */
export function CompactSession({ session, isNext, starting, onToggle, onMenu, onStart }: Pick<SessionViewProps, 'session' | 'isNext' | 'starting' | 'onToggle' | 'onMenu' | 'onStart'>) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = palette.border;
  return (
    <View style={[styles.compact, { borderColor: isNext ? palette.accentStrong : ink, borderWidth: isNext ? 1.5 : StyleSheet.hairlineWidth, backgroundColor: palette.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('userProgram.expandDay', { name: session.name })}
        onPress={onToggle}
        onLongPress={onMenu}
        accessibilityHint={t('workoutDetails.editHint')}
        accessibilityActions={[{ name: 'longpress', label: t('workoutDetails.editHint') }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onMenu(); }}
        style={styles.compactMain}
      >
        {isNext ? <Label style={{ color: palette.accentStrong }}>{t('programDetail.suggested')}</Label> : null}
        <Text style={styles.compactName}>{session.name}</Text>
        <Label>{t('userProgram.setsOnly', { count: sessionSetCount(session) })}</Label>
      </Pressable>
      <IconButton icon="play" tone={isNext ? 'accent' : 'muted'} label={`${t('userProgram.start')} ${session.name}`} disabled={starting !== null} onPress={onStart} />
    </View>
  );
}

/** Minimal name-only row for scanning many prescribed workouts; tap to inspect, long-press for actions. */
export function BareboneSessionRow({ session, isNext, bordered = true, onToggle, onMenu }: Pick<SessionViewProps, 'session' | 'isNext' | 'onToggle' | 'onMenu'> & { bordered?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: false }}
      accessibilityLabel={t('userProgram.expandDay', { name: session.name })}
      accessibilityHint={t('workoutDetails.editHint')}
      accessibilityActions={[{ name: 'longpress', label: t('workoutDetails.editHint') }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onMenu(); }}
      onPress={onToggle}
      onLongPress={onMenu}
      style={({ pressed }) => [
        styles.bareboneRow,
        bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
        { backgroundColor: pressed ? palette.surfaceMuted : 'transparent' },
      ]}
    >
      <Text style={[styles.bareboneName, { color: isNext ? palette.accentStrong : palette.text }]}>{session.name}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  session: { gap: 12 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionHead: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headMeta: { alignItems: 'flex-end', gap: 4 },
  sessionName: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  exerciseRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 5 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 15 },
  target: { fontFamily: fonts.medium, fontSize: 14 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.surface, paddingLeft: 12, paddingRight: 4 },
  compactMain: { flex: 1, minHeight: 56, paddingVertical: 8, gap: 2, justifyContent: 'center' },
  compactName: { fontFamily: fonts.semibold, fontSize: 16 },
  bareboneRow: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  bareboneName: { fontFamily: fonts.semibold, fontSize: 15 },
});
