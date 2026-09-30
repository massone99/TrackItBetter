import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { sessionSetCount, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { Body, Heading, Icon, IconButton, Text, tapFeedback, type IconName } from '../../shared/components/ui';
import { useAppInsets } from '../../shared/layout/useAppInsets';
import { useAnimationSettings } from '../../shared/settings/AnimationProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { listExercises } from '../exercises/repository';
import { logPastUserProgramSession } from '../programs/startUserSession';
import { listUserPrograms } from '../programs/userPrograms';
import { defaultPastStart } from './pastStart';
import { createPastWorkout } from './repository';

type Step = { name: 'start' } | { name: 'programs' } | { name: 'sessions'; programId: string };
const withMovements = (program: UserProgram) => program.sessions.filter((session) => session.exercises.length > 0);

/**
 * Log a past workout in up to three taps: empty, or from a program (choose the program, then one
 * of its workouts). The new workout opens on its details, where the day and time are set.
 */
export function PastWorkoutFlow({ visible, dateKey, onClose }: { visible: boolean; dateKey: string | null; onClose: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const insets = useAppInsets();
  const { speed, reducedMotion } = useAnimationSettings();
  const [step, setStep] = useState<Step>({ name: 'start' });
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void listUserPrograms().then((found) => {
      if (mounted) setPrograms(found.filter((program) => withMovements(program).length > 0));
    }).catch(() => undefined);
    void listExercises().then((exercises) => {
      if (mounted) setNames(new Map(exercises.map((exercise) => [exercise.id, exercise.name])));
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [visible]);

  const program = step.name === 'sessions' ? programs.find((item) => item.id === step.programId) : undefined;
  const close = () => { setStep({ name: 'start' }); setError(null); onClose(); };
  const back = () => { setError(null); setStep(step.name === 'sessions' ? { name: 'programs' } : { name: 'start' }); };
  const go = (next: Step) => { tapFeedback(); setError(null); setStep(next); };

  const run = async (create: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const workoutId = await create();
      close();
      router.push({ pathname: '/workout/history/[id]', params: { id: workoutId, edit: '1' } });
    } catch (reason) {
      setError(`${t('log.pastError')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setBusy(false);
    }
  };
  const startAt = () => defaultPastStart(dateKey);
  const title = step.name === 'start' ? t('log.addPast') : step.name === 'programs' ? t('log.pastPickProgram') : program?.name ?? t('log.pastPickWorkout');
  const subtitle = step.name === 'start' ? t('log.pastBody') : step.name === 'programs' ? t('log.pastProgramsBody') : t('log.pastPickWorkout');

  return (
    <Modal visible={visible} animationType={reducedMotion || speed === 'off' ? 'none' : speed === 'fast' ? 'fade' : 'slide'} onRequestClose={step.name === 'start' ? close : back} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { backgroundColor: palette.background, paddingTop: Math.max(insets.top, 14) + 10 }]}>
        <View style={styles.header}>
          {step.name !== 'start' ? <IconButton icon="chevron-back" label={t('common.back')} onPress={back} /> : null}
          <View style={styles.headerText}>
            <Heading style={styles.title} numberOfLines={2}>{title}</Heading>
            <Body>{subtitle}</Body>
          </View>
          <IconButton icon="close" label={t('workout.close')} onPress={close} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <StepFade key={step.name + (step.name === 'sessions' ? step.programId : '')} style={styles.stack}>
            {step.name === 'start' ? (
              <>
                <Tile
                  icon="albums-outline"
                  title={t('log.pastFromProgram')}
                  body={programs.length > 0 ? t('log.pastFromProgramBody') : t('log.pastNoPrograms')}
                  featured
                  disabled={programs.length === 0}
                  onPress={() => go({ name: 'programs' })}
                />
                <Tile
                  icon="add-circle-outline"
                  title={t('log.pastEmpty')}
                  body={t('log.pastEmptyBody')}
                  disabled={busy}
                  onPress={() => void run(async () => createPastWorkout({ name: t('log.pastName'), startedAt: startAt(), minutes: 60 }))}
                />
              </>
            ) : null}

            {step.name === 'programs' ? programs.map((item) => (
              <Tile
                key={item.id}
                icon="albums-outline"
                title={item.name}
                body={t('log.pastProgramMeta', { count: withMovements(item).length, sets: withMovements(item).reduce((sum, session) => sum + sessionSetCount(session), 0) })}
                chips={withMovements(item).map((session) => session.name)}
                onPress={() => go({ name: 'sessions', programId: item.id })}
              />
            )) : null}

            {step.name === 'sessions' && program ? withMovements(program).map((session, index) => (
              <SessionTile
                key={session.id}
                index={index + 1}
                session={session}
                names={names}
                disabled={busy}
                onPress={() => void run(() => logPastUserProgramSession(program, session, startAt(), 60))}
              />
            )) : null}
            {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}
          </StepFade>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Fades a step in on mount with the plain Animated API, which behaves the same inside a native Modal. */
function StepFade({ children, style }: { children: ReactNode; style: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => { Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(); }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** A large tappable card; `featured` fills it with the accent colour for the main choice. */
function Tile({ icon, title, body, chips, featured = false, disabled = false, onPress }: {
  icon: IconName;
  title: string;
  body: string;
  chips?: string[];
  featured?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = featured ? palette.accentText : palette.text;
  const muted = featured ? palette.accentText : palette.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: featured ? palette.accent : palette.surface, borderColor: featured ? palette.accent : palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: featured ? 'rgba(255,255,255,0.18)' : palette.accentSoft }]}>
        <Icon name={icon} size={26} color={featured ? palette.accentText : palette.accentStrong} />
      </View>
      <View style={styles.tileText}>
        <Text style={[styles.tileTitle, { color: ink }]}>{title}</Text>
        <Text style={[styles.tileBody, { color: muted, opacity: featured ? 0.85 : 1 }]}>{body}</Text>
        {chips && chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.slice(0, 4).map((chip, index) => (
              <View key={index} style={[styles.chip, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>{chip}</Text></View>
            ))}
          </View>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={20} color={muted} />
    </Pressable>
  );
}

/** One workout of a program: its number, name and the movements it is made of. */
function SessionTile({ index, session, names, disabled, onPress }: { index: number; session: UserProgramSession; names: Map<string, string>; disabled: boolean; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const list = useMemo(() => session.exercises.map((exercise) => names.get(exercise.exerciseId) ?? t('userProgram.exerciseMissing')), [session, names, t]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.name}. ${t('log.pastSessionMeta', { exercises: session.exercises.length, sets: sessionSetCount(session) })}`}
      disabled={disabled}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.tile, styles.sessionTile, { backgroundColor: palette.surface, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <View style={styles.sessionHead}>
        <View style={[styles.number, { backgroundColor: palette.accentSoft }]}><Text style={[styles.numberText, { color: palette.accentStrong }]}>{index}</Text></View>
        <View style={styles.tileText}>
          <Text style={styles.tileTitle}>{session.name}</Text>
          <Text style={[styles.tileBody, { color: palette.textMuted }]}>{t('log.pastSessionMeta', { exercises: session.exercises.length, sets: sessionSetCount(session) })}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={palette.textMuted} />
      </View>
      <View style={[styles.movements, { borderTopColor: palette.border }]}>
        {list.slice(0, 4).map((name, position) => <Text key={position} numberOfLines={1} style={[styles.movement, { color: palette.text }]}>{name}</Text>)}
        {list.length > 4 ? <Text style={[styles.movement, { color: palette.textMuted }]}>{t('log.pastMore', { more: list.length - 4 })}</Text> : null}
      </View>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20 },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  content: { paddingHorizontal: 20, paddingTop: 22 },
  stack: { gap: 14 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 22, padding: 18 },
  tileIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: 3 },
  tileTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  tileBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 160 },
  chipText: { fontFamily: fonts.medium, fontSize: 12 },
  sessionTile: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: fonts.display, fontSize: 18 },
  movements: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  movement: { fontFamily: fonts.medium, fontSize: 14 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
