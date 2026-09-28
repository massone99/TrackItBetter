import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAppInsets } from '../../../src/shared/layout/useAppInsets';
import { expandRoutine, type MobilitySegment, type MobilitySide } from '../../../src/domain/mobilityPlan';
import { openReferenceVideo } from '../../../src/features/exercises/ReferenceLinkSheet';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { getMobilityRoutine, type MobilityRoutine } from '../../../src/features/mobility/routines';
import { logCompletedWorkout, type LoggedSetInput } from '../../../src/features/session/repository';
import { ActionButton, Icon, IconButton, PageHeading, Screen, Sheet, tapFeedback, Text } from '../../../src/shared/components/ui';
import { readBooleanPreference, writePreference } from '../../../src/shared/settings/preferences';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { formatClock } from '../../../src/shared/utils/format';
import { playBeep } from '../../../src/shared/audio/beeps';
import { goBack } from '../../../src/shared/navigation/goBack';

const VOICE_KEY = 'mobility.voice';

type DrillInfo = { name: string; cue: string | null; demoUrl: string | null };
type Performed = { stepIndex: number; side: MobilitySide | null; seconds: number | null; reps: number | null; completedAt: Date };

function readCues(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null;
  } catch {
    return null;
  }
}

export default function MobilityPlayerScreen() {
  useKeepAwake();
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const insets = useAppInsets();
  const [routine, setRoutine] = useState<MobilityRoutine | null | undefined>(undefined);
  const [drills, setDrills] = useState<DrillInfo[]>([]);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [performed, setPerformed] = useState<Map<number, Performed>>(new Map());
  const [ending, setEnding] = useState(false);
  const [voice, setVoice] = useState(() => readBooleanPreference(VOICE_KEY, true));
  const startedAt = useRef(new Date());
  const finished = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const found = await getMobilityRoutine(id);
      if (!mounted) return;
      setRoutine(found);
      if (!found) return;
      const infos = await Promise.all(found.steps.map(async (step) => {
        const exercise = await getExerciseById(step.exerciseId);
        return { name: exercise?.name ?? '—', cue: exercise ? readCues(exercise.cues) : null, demoUrl: exercise?.demoUrl ?? null };
      }));
      if (!mounted) return;
      setDrills(infos);
    })();
    return () => { mounted = false; void Speech.stop(); };
  }, [id]);

  // Every drill starts after the routine's countdown, the first one included.
  const segments = useMemo<MobilitySegment[]>(() => (routine ? expandRoutine(routine) : []), [routine]);
  const segment = segments[index] as MobilitySegment | undefined;
  const paused = pausedRemaining !== null;
  const remainingMs = paused ? pausedRemaining : endsAt === null ? null : Math.max(0, endsAt - now);

  useEffect(() => {
    if (paused || endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [paused, endsAt]);

  const speak = useCallback((text: string) => {
    if (!voice) return;
    void Speech.stop();
    Speech.speak(text, { language: i18n.resolvedLanguage === 'it' ? 'it-IT' : 'en-US', rate: 0.98 });
  }, [voice, i18n.resolvedLanguage]);

  const finish = useCallback(async (records: Map<number, Performed>) => {
    if (finished.current || !routine) return;
    finished.current = true;
    void Speech.stop();
    const byStep = new Map<number, LoggedSetInput[]>();
    for (const record of [...records.values()].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())) {
      const sets = byStep.get(record.stepIndex) ?? [];
      sets.push({ durationSec: record.seconds, reps: record.reps, side: record.side ?? 'both', completedAt: record.completedAt });
      byStep.set(record.stepIndex, sets);
    }
    if (byStep.size === 0) { goBack('/mobility'); return; }
    const workoutId = await logCompletedWorkout({
      name: routine.name,
      startedAt: startedAt.current,
      endedAt: new Date(),
      entries: [...byStep.entries()].sort(([a], [b]) => a - b).map(([stepIndex, sets]) => ({ exerciseId: routine.steps[stepIndex].exerciseId, sets })),
    });
    router.replace({ pathname: '/workout/summary/[id]', params: { id: workoutId } });
  }, [routine]);

  const goTo = useCallback((next: number, records: Map<number, Performed>) => {
    if (next >= segments.length) { void finish(records); return; }
    const target = segments[next];
    setIndex(next);
    setPausedRemaining(null);
    const timed = target.kind !== 'work' || target.mode === 'hold';
    const seconds = target.kind === 'work' ? target.durationSec ?? 0 : target.durationSec;
    setEndsAt(timed ? Date.now() + seconds * 1000 : null);
    setNow(Date.now());
    // A drill starting gets the "go" beep; breaks between drills only a light tap.
    if (target.kind === 'work') playBeep('go'); else tapFeedback();
    if (target.kind === 'work') {
      const drill = drills[target.stepIndex];
      const side = target.side === 'left' ? t('mobility.left') : target.side === 'right' ? t('mobility.right') : '';
      speak([drill?.name, side].filter(Boolean).join('. '));
    } else if (target.kind === 'switch') {
      speak(t('mobility.switchLabel'));
    } else if (target.kind === 'rest') {
      speak(t('mobility.restLabel'));
    } else {
      // A countdown before a drill names what comes next, so there is time to get into position.
      speak(t('mobility.getReadyFor', { name: drills[target.stepIndex]?.name ?? '' }));
    }
  }, [segments, drills, finish, speak, t]);

  // Starts the first segment once the drill names are known, so the first cue can name the drill.
  useEffect(() => {
    if (started.current || segments.length === 0 || drills.length === 0) return;
    started.current = true;
    startedAt.current = new Date();
    goTo(0, new Map());
  }, [segments, drills, goTo]);

  const completeCurrent = useCallback((records: Map<number, Performed>) => {
    if (!segment) return records;
    if (segment.kind !== 'work') return records;
    const next = new Map(records);
    next.set(index, { stepIndex: segment.stepIndex, side: segment.side, seconds: segment.durationSec, reps: segment.reps, completedAt: new Date() });
    return next;
  }, [segment, index]);

  // Timed segments advance on their own when the countdown reaches zero.
  useEffect(() => {
    if (!segment || paused || remainingMs === null || remainingMs > 0 || finished.current) return;
    const records = completeCurrent(performed);
    setPerformed(records);
    goTo(index + 1, records);
  }, [segment, paused, remainingMs, completeCurrent, performed, goTo, index]);

  // A light tick for the last three seconds of each countdown, spoken aloud before a drill starts.
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const countingIn = segment !== undefined && segment.kind !== 'work';
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0 || secondsLeft > 3 || paused) return;
    playBeep('tick');
    if (countingIn) speak(String(secondsLeft));
  }, [secondsLeft, paused, countingIn, speak]);

  const togglePause = () => {
    if (remainingMs === null) return;
    if (paused) {
      setEndsAt(Date.now() + (pausedRemaining ?? 0));
      setPausedRemaining(null);
      setNow(Date.now());
    } else {
      setPausedRemaining(remainingMs);
      void Speech.stop();
    }
  };
  const addTen = () => {
    if (paused) setPausedRemaining((value) => (value ?? 0) + 10_000);
    else if (endsAt !== null) setEndsAt(endsAt + 10_000);
  };
  const skip = () => goTo(index + 1, performed);
  const doneReps = () => {
    const records = completeCurrent(performed);
    setPerformed(records);
    goTo(index + 1, records);
  };
  const back = () => {
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (segments[candidate].kind === 'work') {
        const records = new Map(performed);
        records.delete(candidate);
        setPerformed(records);
        goTo(candidate, records);
        return;
      }
    }
  };
  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    writePreference(VOICE_KEY, String(next));
    if (!next) void Speech.stop();
  };

  if (routine === undefined) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (routine === null || !segment) return <Screen><PageHeading title={t('mobility.title')} subtitle={t('mobility.notFound')} /></Screen>;

  const workSegments = segments.map((item, position) => ({ item, position })).filter(({ item }) => item.kind === 'work');
  const drill = drills[segment.stepIndex];
  const step = routine.steps[segment.stepIndex];
  const label = segment.kind === 'prep'
    ? t('mobility.getReady')
    : segment.kind === 'work'
      ? (segment.mode === 'hold' ? t('mobility.holdLabel') : t('mobility.repsLabel'))
      : segment.kind === 'rest' ? t('mobility.restLabel') : segment.kind === 'switch' ? t('mobility.switchLabel') : t('mobility.transitionLabel');
  const nextWork = workSegments.find(({ position }) => position > index);
  const nextName = nextWork && nextWork.item.stepIndex !== segment.stepIndex ? drills[nextWork.item.stepIndex]?.name : null;
  const isWork = segment.kind === 'work';
  const repsMode = isWork && segment.mode === 'reps';
  const totalMs = (segment.kind === 'work' ? segment.durationSec ?? 0 : segment.durationSec) * 1000;
  const progress = totalMs > 0 && remainingMs !== null ? 1 - remainingMs / totalMs : 0;
  const background = isWork ? palette.hero : palette.background;
  const ink = isWork ? palette.heroText : palette.text;
  const soft = isWork ? 'rgba(255,255,255,0.72)' : palette.textMuted;
  const sideLabel = segment.kind === 'work' && segment.side ? (segment.side === 'left' ? t('mobility.left') : t('mobility.right')) : null;

  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: Math.max(insets.top, 14) + 6, paddingBottom: insets.bottom + 18 }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label={t('mobility.endTitle')} tone="plain" color={ink} onPress={() => setEnding(true)} />
        <Text style={[styles.routineName, { color: soft }]} numberOfLines={1}>{routine.name}</Text>
        <IconButton icon={voice ? 'volume-high' : 'volume-mute-outline'} label={t('mobility.voice')} tone="plain" color={ink} onPress={toggleVoice} />
      </View>

      <View style={styles.segmentsBar}>
        {workSegments.map(({ position }) => (
          <View key={position} style={[styles.segmentTrack, { backgroundColor: isWork ? 'rgba(255,255,255,0.22)' : palette.surfaceMuted }]}>
            <View style={[styles.segmentFill, {
              backgroundColor: isWork ? palette.heroText : palette.accent,
              width: position < index ? '100%' : position === index ? `${Math.round(progress * 100)}%` : '0%',
            }]} />
          </View>
        ))}
      </View>

      <View style={styles.center}>
        <Text style={[styles.phase, { color: soft }]}>{label}</Text>
        <Text style={[styles.drillName, { color: ink }]} numberOfLines={3}>{drill?.name}</Text>
        <View style={styles.badges}>
          {sideLabel ? <Badge text={sideLabel} dark={isWork} /> : null}
          {step && step.rounds > 1 && segment.kind === 'work' ? <Badge text={t('mobility.round', { round: segment.round, rounds: step.rounds })} dark={isWork} /> : null}
        </View>
        {repsMode ? (
          <Text style={[styles.timer, { color: ink }]}>{t('mobility.repsValue', { count: segment.reps ?? 0 })}</Text>
        ) : (
          <Text accessibilityLiveRegion="polite" style={[styles.timer, { color: ink }]}>{formatClock((remainingMs ?? 0) / 1000 + 0.999)}</Text>
        )}
        {drill?.cue && (isWork || segment.kind === 'prep') ? <Text style={[styles.cue, { color: soft }]}>{drill.cue}</Text> : null}
        {drill?.demoUrl ? (
          <Pressable accessibilityRole="link" onPress={() => openReferenceVideo(drill.demoUrl!)} style={styles.reference}>
            <Icon name="play-circle-outline" size={18} color={ink} />
            <Text style={[styles.referenceText, { color: ink }]}>{t('logger.referenceOpen')}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.nextUp, { color: soft }]}>{nextName ? t('mobility.nextUp', { name: nextName }) : !nextWork ? t('mobility.lastOne') : ' '}</Text>

      <View style={styles.controls}>
        <ControlButton icon="play-skip-back" label={t('mobility.back')} onPress={back} dark={isWork} />
        {repsMode ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('mobility.done')} onPress={doneReps} style={[styles.mainButton, { backgroundColor: isWork ? palette.heroText : palette.accent }]}>
            <Icon name="checkmark" size={34} color={isWork ? palette.hero : palette.accentText} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={paused ? t('mobility.resume') : t('mobility.pause')} onPress={togglePause} style={[styles.mainButton, { backgroundColor: isWork ? palette.heroText : palette.accent }]}>
            <Icon name={paused ? 'play' : 'pause'} size={32} color={isWork ? palette.hero : palette.accentText} />
          </Pressable>
        )}
        <ControlButton icon="play-skip-forward" label={t('mobility.skip')} onPress={skip} dark={isWork} />
      </View>
      {repsMode ? <View style={styles.addTenSpacer} /> : (
        <Pressable accessibilityRole="button" onPress={addTen} style={styles.addTen}>
          <Text style={[styles.addTenText, { color: soft }]}>{t('mobility.addTen')}</Text>
        </Pressable>
      )}

      <Sheet
        visible={ending}
        onClose={() => setEnding(false)}
        title={t('mobility.endTitle')}
        body={performed.size > 0 ? t('mobility.endBody', { count: performed.size }) : undefined}
      >
        {performed.size > 0 ? <ActionButton icon="checkmark" label={t('mobility.endSave')} onPress={() => { setEnding(false); void finish(performed); }} /> : null}
        <ActionButton label={t('mobility.keepGoing')} secondary onPress={() => setEnding(false)} />
        <ActionButton label={t('mobility.endDiscard')} variant="danger" onPress={() => { finished.current = true; void Speech.stop(); goBack('/mobility'); }} />
      </Sheet>
    </View>
  );
}

function Badge({ text, dark }: { text: string; dark: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : palette.accentSoft }]}>
      <Text style={[styles.badgeText, { color: dark ? palette.heroText : palette.accentStrong }]}>{text}</Text>
    </View>
  );
}

function ControlButton({ icon, label, onPress, dark }: { icon: 'play-skip-back' | 'play-skip-forward'; label: string; onPress: () => void; dark: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.sideButton, { backgroundColor: dark ? 'rgba(255,255,255,0.16)' : palette.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={22} color={dark ? palette.heroText : palette.text} />
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineName: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 15 },
  segmentsBar: { flexDirection: 'row', gap: 4, marginTop: 14 },
  segmentTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 3 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  phase: { fontFamily: fonts.semibold, fontSize: 17 },
  drillName: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, textAlign: 'center' },
  badges: { flexDirection: 'row', gap: 8, minHeight: 30 },
  badge: { paddingHorizontal: 12, height: 30, borderRadius: 999, justifyContent: 'center' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 14 },
  timer: { fontFamily: fonts.display, fontSize: 112, lineHeight: 118, fontVariant: ['tabular-nums'] },
  cue: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 420 },
  reference: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  referenceText: { fontFamily: fonts.semibold, fontSize: 15, textDecorationLine: 'underline' },
  nextUp: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 15, marginBottom: 18 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  mainButton: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  sideButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  addTen: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  addTenText: { fontFamily: fonts.semibold, fontSize: 16 },
  addTenSpacer: { height: 44 },
});
