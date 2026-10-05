import * as ImagePicker from 'expo-image-picker';
import { isPickerUnavailableError } from '../../src/shared/media/pickerErrors';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { displayedAngle, findPosition, LOW_CONFIDENCE, levelFor, nextLevelTarget, type JointAngleId, type Pose, type PoseSide, type PositionId } from '../../src/domain/pose';
import { detectPose, poseDetectionAvailable } from '../../src/features/pose/detectPose';
import { extractFrames, normalizeImage, type PoseImage, type VideoFrame } from '../../src/features/pose/media';
import { PoseCanvas } from '../../src/features/pose/PoseCanvas';
import { getExerciseById } from '../../src/features/exercises/repository';
import { getSetLink, savePoseCapture, type PoseLink } from '../../src/features/pose/repository';
import { describeLink, PoseLinkSheet } from '../../src/features/pose/PoseLink';
import { ActionButton, Body, Card, Chip, Icon, IconButton, Label, ListGroup, ListRow, Numeral, PageHeading, Screen, SegmentedControl, tapFeedback, Text, TextField } from '../../src/shared/components/ui';
import { DateField } from '../../src/shared/components/DateTimePickers';
import { useAppInsets } from '../../src/shared/layout/useAppInsets';
import { OverlayLegend, useOverlaySettings } from '../../src/features/pose/OverlayLegend';
import { PositionPicker } from '../../src/features/pose/PositionPicker';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { JointPicker, useJointSelection } from '../../src/features/pose/JointPicker';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

/** The message with the technical cause in brackets, so a failure on a phone can be reported. */
const FRAME_WIDTH = 76;
const FRAME_GAP = 8;

function withDetail(message: string, failure: unknown): string {
  const detail = failure instanceof Error ? failure.message : String(failure);
  return detail ? `${message} (${detail})` : message;
}

/** `detected` is the model's own result, kept so manual corrections can be reset. */
type Analysis = { image: PoseImage; pose: Pose; detected: Pose; kind: 'photo' | 'frame' };

export default function NewPoseCheckScreen() {
  const styles = useScaledStyles(baseStyles);
  // A form-check clip can be opened here directly: its frames load on arrival. Opened from a set, the
  // analysis starts linked to that set and its exercise.
  const { positionId: initial, videoUri, durationMs, setId, exerciseId } = useLocalSearchParams<{ positionId?: string; videoUri?: string; durationMs?: string; setId?: string; exerciseId?: string }>();
  const { t, i18n } = useTranslation();
  const [link, setLink] = useState<PoseLink | null>(null);
  // The day the photo or video was taken: today unless set, or the day of the linked set's workout.
  const [day, setDay] = useState(() => new Date());
  const chooseLink = (next: PoseLink | null) => {
    setLink(next);
    if (next?.set) setDay(next.set.workoutStartedAt);
  };
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => {
    if (!setId) return;
    let mounted = true;
    void getSetLink(setId).then((found) => {
      if (!mounted || !found) return;
      setLink(found);
      if (found.set) setDay(found.set.workoutStartedAt);
    });
    return () => { mounted = false; };
  }, [setId]);
  // Opened from an exercise page, the analysis starts linked to that exercise.
  useEffect(() => {
    if (!exerciseId || setId) return;
    let mounted = true;
    void getExerciseById(exerciseId).then((found) => { if (mounted && found) setLink({ exerciseId: found.id, exerciseName: found.name, set: null }); });
    return () => { mounted = false; };
  }, [exerciseId, setId]);
  const { palette } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [positionId, setPositionId] = useState<PositionId>((findPosition(initial ?? '')?.id) ?? 'front_split');
  const [side, setSide] = useState<PoseSide>('left');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const position = findPosition(positionId)!;
  const [jointIds, setJointIds] = useJointSelection(position);
  const [overlay, setOverlay] = useOverlaySettings();
  const [focused, setFocused] = useState<JointAngleId | null>(null);
  // Poses before each drag, most recent last, for "undo last change".
  const [undo, setUndo] = useState<Pose[]>([]);
  const insets = useAppInsets();
  const [layersOpen, setLayersOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const strip = useRef<ScrollView>(null);
  // Keep the chosen frame in view when it is picked for the user ("find my best position").
  useEffect(() => {
    if (selectedFrame !== null) strip.current?.scrollTo({ x: Math.max(0, selectedFrame * (FRAME_WIDTH + FRAME_GAP) - 80), animated: true });
  }, [selectedFrame]);

  const measurement = useMemo(() => (analysis ? position.measure(analysis.pose, position.sideAware ? side : null) : null), [analysis, position, side]);
  const joints = measurement?.joints?.filter((joint) => jointIds.includes(joint.id)) ?? [];
  const legendAngles = joints.map((joint) => ({ id: joint.id, name: t(`pose.jointsShort.${joint.id}`), value: t('pose.degrees', { value: Math.round(joint.value) }) }));
  // The free analysis leads with a picked joint angle; a position with its own measurement.
  const shown = measurement ? displayedAngle(position, measurement, jointIds, focused) : null;
  const level = measurement ? levelFor(position, measurement.value) : null;
  const target = measurement ? nextLevelTarget(position, measurement.value) : null;
  const uncertain = analysis ? analysis.pose.some((point) => point.score < LOW_CONFIDENCE) : false;
  const noPerson = analysis ? analysis.pose.reduce((sum, point) => sum + point.score, 0) / analysis.pose.length < 0.2 : false;

  useEffect(() => {
    if (!videoUri || !poseDetectionAvailable) return;
    let mounted = true;
    void extractFrames(videoUri, Number(durationMs ?? 0)).then((extracted) => { if (mounted) setFrames(extracted); }).catch((failure: unknown) => { if (mounted) setError(withDetail(t('pose.error'), failure)); });
    return () => { mounted = false; };
  }, [videoUri, durationMs, t]);

  const analyse = async (image: PoseImage, kind: 'photo' | 'frame') => {
    setBusy(t('pose.analysing'));
    setError(null);
    try {
      const { pose } = await detectPose(image.uri);
      setAnalysis({ image, pose, detected: pose, kind });
      setUndo([]);
    } catch (failure) {
      setError(withDetail(t('pose.error'), failure));
    } finally {
      setBusy(null);
    }
  };

  const pick = async (source: 'camera' | 'photo' | 'video') => {
    setError(null);
    try {
      // Only the camera needs a permission: the system gallery picker hands over the chosen file without one,
      // so asking for library access could only get in the way (or fail) before it opens.
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setError(t('pose.permission')); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: source === 'video' ? ['videos'] : ['images'], quality: 1, videoMaxDuration: 60 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setAnalysis(null);
      setFrames([]);
      setSelectedFrame(null);
      setBusy(t('pose.analysing'));
      if (source === 'video') {
        setFrames(await extractFrames(asset.uri, asset.duration ?? 0));
      } else {
        const image = await normalizeImage(asset.uri, asset.width, asset.height);
        await analyse(image, 'photo');
      }
    } catch (failure) {
      // Nothing may fail silently: a button that does nothing is the worst answer.
      console.warn('[pose] pick failed:', failure);
      setError(isPickerUnavailableError(failure) ? t('common.pickerRestart') : withDetail(t('pose.error'), failure));
    } finally {
      setBusy(null);
    }
  };

  const chooseFrame = async (index: number) => {
    setSelectedFrame(index);
    await analyse(frames[index], 'frame');
  };

  // Runs the model on every frame and keeps the one with the best reading for this position.
  const findBest = async () => {
    let best: { index: number; value: number; pose: Pose } | null = null;
    for (const [index, frame] of frames.entries()) {
      setBusy(t('pose.scanning', { done: index + 1, total: frames.length }));
      try {
        const { pose } = await detectPose(frame.uri);
        const result = position.measure(pose, position.sideAware ? side : null);
        if (result.confidence < LOW_CONFIDENCE) continue;
        const better = !best || (position.better === 'higher' ? result.value > best.value : result.value < best.value);
        if (better) best = { index, value: result.value, pose };
      } catch {
        // Skip frames the model cannot read.
      }
    }
    setBusy(null);
    if (!best) { setError(t('pose.noPerson')); return; }
    setSelectedFrame(best.index);
    setAnalysis({ image: frames[best.index], pose: best.pose, detected: best.pose, kind: 'frame' });
    setUndo([]);
  };

  const save = async () => {
    if (!analysis || !measurement || level === null) return;
    setBusy(t('pose.save'));
    try {
      await savePoseCapture({
        positionId,
        side: position.sideAware ? side : null,
        value: shown?.value ?? measurement.value,
        // The free analysis has no levels.
        level: position.generic ? 0 : level,
        pose: analysis.pose,
        sourceUri: analysis.image.uri,
        width: analysis.image.width,
        height: analysis.image.height,
        mediaKind: analysis.kind,
        note,
        exerciseId: position.generic ? link?.exerciseId ?? null : null,
        setId: position.generic ? link?.set?.id ?? null : null,
        capturedAt: atDay(day),
      });
      // Started from a set or an exercise, saving returns there; otherwise to the position's history.
      if ((setId || exerciseId) && router.canGoBack()) router.back();
      else router.replace({ pathname: '/pose/[positionId]', params: { positionId } });
    } catch {
      setError(t('pose.error'));
      setBusy(null);
    }
  };

  if (!poseDetectionAvailable) {
    return <Screen><PageHeading title={t('pose.newCheck')} subtitle={t('pose.unavailable')} /></Screen>;
  }

  const canvasWidth = Math.min(windowWidth - 40, 600);
  const hasMedia = analysis !== null || frames.length > 0;
  const angleValues = Object.fromEntries(legendAngles.map((angle) => [angle.id, angle.value]));
  return (
    <Screen
      contentContainerStyle={analysis ? { paddingBottom: insets.bottom + 110 } : undefined}
      overlay={analysis && measurement && level !== null ? (
        // Saving stays in reach however long the frame, angles and note make the page.
        <View style={[styles.saveBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ActionButton icon="checkmark" label={t('pose.save')} disabled={Boolean(busy)} onPress={() => void save()} />
        </View>
      ) : undefined}
    >
      <PageHeading title={t('pose.newCheck')} subtitle={hasMedia ? undefined : t(`pose.positions.${positionId}.how`)} />

      {hasMedia ? (
        // With a frame on screen the setup folds to one line; "Change" opens it again.
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: setupOpen }} onPress={() => { tapFeedback(); setSetupOpen((open) => !open); }} style={[styles.setupSummary, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.flex}>
            <Label>{t('pose.position')}</Label>
            <Text style={styles.setupName} numberOfLines={1}>{t(`pose.positions.${positionId}.name`)}{position.sideAware ? ` · ${side === 'left' ? t('pose.sideLeft') : t('pose.sideRight')}` : ''}</Text>
          </View>
          <Text style={[styles.setupChange, { color: palette.accentStrong }]}>{t('pose.changeAction')}</Text>
          <Icon name={setupOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
        </Pressable>
      ) : null}
      {!hasMedia || setupOpen ? (
        <>
          <PositionPicker value={position} onChange={(id) => { setPositionId(id); setFocused(null); }} />
          {position.sideAware ? (
            <SegmentedControl<PoseSide> value={side} onChange={setSide} options={[{ value: 'left', label: t('pose.sideLeft') }, { value: 'right', label: t('pose.sideRight') }]} />
          ) : null}
        </>
      ) : null}

      {hasMedia ? (
        // Once there is something to measure, the sources shrink to one slim row and the work takes the screen.
        <View style={styles.sourceBar}>
          <Label style={styles.flex}>{t('pose.newMedia')}</Label>
          <IconButton icon="camera-outline" tone="accent" label={t('pose.takePhoto')} onPress={() => void pick('camera')} />
          <IconButton icon="image-outline" tone="accent" label={t('pose.choosePhoto')} onPress={() => void pick('photo')} />
          <IconButton icon="film-outline" tone="accent" label={t('pose.chooseVideo')} onPress={() => void pick('video')} />
        </View>
      ) : (
        <>
          <JointPicker position={position} selected={jointIds} onChange={setJointIds} />
          <View style={styles.sources}>
            <SourceButton icon="camera-outline" label={t('pose.takePhoto')} onPress={() => void pick('camera')} />
            <SourceButton icon="image-outline" label={t('pose.choosePhoto')} onPress={() => void pick('photo')} />
            <SourceButton icon="film-outline" label={t('pose.chooseVideo')} onPress={() => void pick('video')} />
          </View>
        </>
      )}

      {frames.length > 0 ? (
        <View style={styles.frames}>
          <View style={styles.framesHead}>
            <View style={styles.flex}>
              <Label>{selectedFrame !== null ? t('pose.frameSelected', { seconds: (frames[selectedFrame].timeMs / 1000).toFixed(1) }) : t('pose.frames')}</Label>
              {selectedFrame !== null ? <Text style={[styles.frameCount, { color: palette.textMuted }]}>{t('pose.frameCount', { current: selectedFrame + 1, total: frames.length })}</Text> : null}
            </View>
            <Chip icon="sparkles-outline" label={t('pose.findBestShort')} accessibilityLabel={t('pose.findBest')} onPress={() => void findBest()} />
            <IconButton icon="chevron-back" label={t('pose.prevFrame')} disabled={selectedFrame === null || selectedFrame === 0 || Boolean(busy)} onPress={() => void chooseFrame((selectedFrame ?? 1) - 1)} />
            <IconButton icon="chevron-forward" label={t('pose.nextFrame')} disabled={selectedFrame === null || selectedFrame >= frames.length - 1 || Boolean(busy)} onPress={() => void chooseFrame((selectedFrame ?? -1) + 1)} />
          </View>
          <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frameStrip}>
            {frames.map((frame, index) => (
              <Pressable key={frame.timeMs} accessibilityRole="button" accessibilityState={{ selected: selectedFrame === index }} accessibilityLabel={t('pose.frameAt', { seconds: (frame.timeMs / 1000).toFixed(1) })} onPress={() => void chooseFrame(index)}>
                <Image source={{ uri: frame.uri }} style={[styles.frame, { borderColor: selectedFrame === index ? palette.accent : 'transparent' }]} />
                <Text style={[styles.frameTime, { color: selectedFrame === index ? palette.accentStrong : palette.textMuted }]}>{(frame.timeMs / 1000).toFixed(1)}s</Text>
              </Pressable>
            ))}
          </ScrollView>
          {!analysis && !busy ? <Body>{t('pose.pickFrame')}</Body> : null}
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy}><ActivityIndicator color={palette.accentStrong} /><Body>{busy}</Body></View>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}

      {analysis && measurement && level !== null ? (
        <>
          <PoseCanvas
            uri={analysis.image.uri}
            imageWidth={analysis.image.width}
            imageHeight={analysis.image.height}
            pose={analysis.pose}
            highlight={shown?.angle ?? measurement.angle}
            label={t('pose.degrees', { value: Math.round(shown?.value ?? measurement.value) })}
            angles={legendAngles.map((angle, index) => ({ ...joints[index], ...angle }))}
            settings={overlay}
            focused={focused}
            maxWidth={canvasWidth}
            maxHeight={frames.length > 0 ? 440 : 520}
            onDragStart={() => setUndo((stack) => [...stack.slice(-19), analysis.pose])}
            onChange={(pose) => setAnalysis({ ...analysis, pose })}
          />
          <View style={styles.hintRow}>
            <Icon name={noPerson || uncertain ? 'alert-circle-outline' : 'move-outline'} size={18} color={noPerson || uncertain ? palette.warning : palette.textMuted} />
            <Text style={[styles.hint, { color: noPerson || uncertain ? palette.warning : palette.textMuted }]}>{noPerson ? t('pose.noPerson') : uncertain ? t('pose.uncertain') : t('pose.adjustHint')}</Text>
          </View>
          {undo.length > 0 ? (
            <View style={styles.editRow}>
              <Chip icon="arrow-undo-outline" label={t('pose.undoMove')} onPress={() => {
                const previous = undo[undo.length - 1];
                setUndo(undo.slice(0, -1));
                setAnalysis({ ...analysis, pose: previous });
              }} />
              <Chip icon="refresh" label={t('pose.resetDetection')} onPress={() => {
                setUndo([]);
                setAnalysis({ ...analysis, pose: analysis.detected });
              }} />
            </View>
          ) : null}

          {/* The angle choice sits right under the frame it measures. */}
          <Card style={styles.angles}>
            <JointPicker
              position={position}
              selected={jointIds}
              onChange={setJointIds}
              values={angleValues}
              focused={focused}
              onFocus={setFocused}
              title={t('pose.anglesTitle')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: layersOpen }}
              onPress={() => { tapFeedback(); setLayersOpen((open) => !open); }}
              style={styles.layersToggle}
            >
              <Label style={styles.flex}>{t('pose.display')}</Label>
              <Icon name={layersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
            </Pressable>
            {layersOpen ? <OverlayLegend angles={legendAngles} settings={overlay} focused={focused} onSettings={setOverlay} onFocus={setFocused} hideAngles /> : null}
          </Card>

          {position.generic ? (
            joints.length === 0 ? <Body>{t('pose.freePick')}</Body> : null
          ) : (
            <Card style={styles.result}>
              <View style={styles.resultRow}>
                <View>
                  <Label>{t(`pose.positions.${positionId}.metric`)}</Label>
                  <Numeral>{t('pose.degrees', { value: Math.round(measurement.value) })}</Numeral>
                  <Label>{position.better === 'higher' ? t('pose.higherBetter') : t('pose.lowerBetter')}</Label>
                </View>
                <LevelBadge level={level} />
              </View>
              <Body>{target === null ? t('pose.topLevel') : t('pose.nextTarget', { value: target })}</Body>
              {measurement.warning ? <Text style={[styles.warning, { color: palette.warning }]}>{t(`pose.warnings.${measurement.warning}`)}</Text> : null}
            </Card>
          )}
          <DateField label={t('pose.date')} value={day} locale={i18n.language} maxDate={new Date()} onChange={setDay} />
          {/* A free analysis can belong to an exercise and one of its sets. */}
          {position.generic ? <ListGroup>
            <ListRow
              icon="link-outline"
              title={describeLink(link, t, i18n.language) ?? t('poseLink.none')}
              subtitle={link ? t('poseLink.title') : t('poseLink.hint')}
              onPress={() => { tapFeedback(); setLinkOpen(true); }}
            />
          </ListGroup> : null}
          <TextField value={note} onChangeText={setNote} placeholder={t('pose.notePlaceholder')} maxLength={200} />
        </>
      ) : null}
      <PoseLinkSheet visible={linkOpen} value={link} onChange={chooseLink} onClose={() => setLinkOpen(false)} />
    </Screen>
  );
}

/** The chosen day at the current time of day, so analyses of one day keep the order they were made in. */
function atDay(day: Date): Date {
  const now = new Date();
  const at = new Date(day);
  at.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return at > now ? now : at;
}

function SourceButton({ icon, label, onPress }: { icon: 'camera-outline' | 'image-outline' | 'film-outline'; label: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.source, { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.iconCircle, { backgroundColor: palette.accentSoft }]}><Icon name={icon} size={22} color={palette.accentStrong} /></View>
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  editRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  setupSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  setupName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  setupChange: { fontFamily: fonts.semibold, fontSize: 14 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  layersToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  frameCount: { fontFamily: fonts.medium, fontSize: 13 },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1 },
  sourceLabel: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  iconCircle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  sourceBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  frames: { gap: 10 },
  framesHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  frameStrip: { gap: FRAME_GAP },
  angles: { gap: 12 },
  frame: { width: FRAME_WIDTH, height: 100, borderRadius: 10, borderWidth: 3 },
  frameTime: { fontFamily: fonts.medium, fontSize: 12, textAlign: 'center', marginTop: 2 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  error: { fontFamily: fonts.medium, fontSize: 14, textAlign: 'center' },
  center: { textAlign: 'center' },
  result: { gap: 10 },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  warning: { fontFamily: fonts.medium, fontSize: 14 },
  joints: { gap: 4 },
  jointRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 32 },
  jointStrong: { fontFamily: fonts.display, fontSize: 17 },
});
