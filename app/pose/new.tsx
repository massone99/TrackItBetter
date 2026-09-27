import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { findPosition, LOW_CONFIDENCE, POSITIONS, levelFor, nextLevelTarget, type Pose, type PoseSide, type PositionId } from '../../src/domain/pose';
import { detectPose, poseDetectionAvailable } from '../../src/features/pose/detectPose';
import { extractFrames, normalizeImage, type PoseImage, type VideoFrame } from '../../src/features/pose/media';
import { PoseCanvas } from '../../src/features/pose/PoseCanvas';
import { savePoseCapture } from '../../src/features/pose/repository';
import { ActionButton, Body, Card, Chip, Icon, Label, Numeral, PageHeading, Screen, SegmentedControl, Text, TextField } from '../../src/shared/components/ui';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

type Analysis = { image: PoseImage; pose: Pose; kind: 'photo' | 'frame' };

export default function NewPoseCheckScreen() {
  const styles = useScaledStyles(baseStyles);
  // A form-check clip can be opened here directly: its frames load on arrival.
  const { positionId: initial, videoUri, durationMs } = useLocalSearchParams<{ positionId?: string; videoUri?: string; durationMs?: string }>();
  const { t } = useTranslation();
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

  const measurement = useMemo(() => (analysis ? position.measure(analysis.pose, position.sideAware ? side : null) : null), [analysis, position, side]);
  const level = measurement ? levelFor(position, measurement.value) : null;
  const target = measurement ? nextLevelTarget(position, measurement.value) : null;
  const uncertain = analysis ? analysis.pose.some((point) => point.score < LOW_CONFIDENCE) : false;
  const noPerson = analysis ? analysis.pose.reduce((sum, point) => sum + point.score, 0) / analysis.pose.length < 0.2 : false;

  useEffect(() => {
    if (!videoUri || !poseDetectionAvailable) return;
    let mounted = true;
    void extractFrames(videoUri, Number(durationMs ?? 0)).then((extracted) => { if (mounted) setFrames(extracted); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [videoUri, durationMs]);

  const analyse = async (image: PoseImage, kind: 'photo' | 'frame') => {
    setBusy(t('pose.analysing'));
    setError(null);
    try {
      const { pose } = await detectPose(image.uri);
      setAnalysis({ image, pose, kind });
    } catch {
      setError(t('pose.error'));
    } finally {
      setBusy(null);
    }
  };

  const pick = async (source: 'camera' | 'photo' | 'video') => {
    setError(null);
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(t('pose.permission')); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: source === 'video' ? ['videos'] : ['images'], quality: 1, videoMaxDuration: 60 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAnalysis(null);
    setFrames([]);
    setSelectedFrame(null);
    if (source === 'video') {
      setBusy(t('pose.analysing'));
      try {
        setFrames(await extractFrames(asset.uri, asset.duration ?? 0));
      } catch {
        setError(t('pose.error'));
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy(t('pose.analysing'));
    try {
      const image = await normalizeImage(asset.uri, asset.width, asset.height);
      await analyse(image, 'photo');
    } catch {
      setError(t('pose.error'));
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
    setAnalysis({ image: frames[best.index], pose: best.pose, kind: 'frame' });
  };

  const save = async () => {
    if (!analysis || !measurement || level === null) return;
    setBusy(t('pose.save'));
    try {
      await savePoseCapture({
        positionId,
        side: position.sideAware ? side : null,
        value: measurement.value,
        level,
        pose: analysis.pose,
        sourceUri: analysis.image.uri,
        width: analysis.image.width,
        height: analysis.image.height,
        mediaKind: analysis.kind,
        note,
      });
      router.replace({ pathname: '/pose/[positionId]', params: { positionId } });
    } catch {
      setError(t('pose.error'));
      setBusy(null);
    }
  };

  if (!poseDetectionAvailable) {
    return <Screen><PageHeading title={t('pose.newCheck')} subtitle={t('pose.unavailable')} /></Screen>;
  }

  const canvasWidth = Math.min(windowWidth - 40, 600);
  return (
    <Screen>
      <PageHeading title={t('pose.newCheck')} subtitle={t(`pose.positions.${positionId}.how`)} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        {POSITIONS.map((item) => (
          <Chip key={item.id} label={t(`pose.positions.${item.id}.name`)} selected={item.id === positionId} onPress={() => setPositionId(item.id)} />
        ))}
      </ScrollView>
      {position.sideAware ? (
        <SegmentedControl<PoseSide> value={side} onChange={setSide} options={[{ value: 'left', label: t('pose.sideLeft') }, { value: 'right', label: t('pose.sideRight') }]} />
      ) : null}

      <View style={styles.sources}>
        <SourceButton icon="camera-outline" label={t('pose.takePhoto')} onPress={() => void pick('camera')} />
        <SourceButton icon="image-outline" label={t('pose.choosePhoto')} onPress={() => void pick('photo')} />
        <SourceButton icon="film-outline" label={t('pose.chooseVideo')} onPress={() => void pick('video')} />
      </View>

      {frames.length > 0 ? (
        <View style={styles.frames}>
          <Label>{t('pose.frames')}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frameStrip}>
            {frames.map((frame, index) => (
              <Pressable key={frame.timeMs} accessibilityRole="button" accessibilityLabel={t('pose.frameAt', { seconds: (frame.timeMs / 1000).toFixed(1) })} onPress={() => void chooseFrame(index)}>
                <Image source={{ uri: frame.uri }} style={[styles.frame, { borderColor: selectedFrame === index ? palette.accent : 'transparent' }]} />
                <Text style={[styles.frameTime, { color: palette.textMuted }]}>{(frame.timeMs / 1000).toFixed(1)}s</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ActionButton icon="sparkles-outline" label={t('pose.findBest')} secondary onPress={() => void findBest()} />
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy}><ActivityIndicator color={palette.accentStrong} /><Body>{busy}</Body></View>
      ) : null}
      {error ? <Text style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}

      {analysis && measurement && level !== null ? (
        <>
          <PoseCanvas
            uri={analysis.image.uri}
            imageWidth={analysis.image.width}
            imageHeight={analysis.image.height}
            pose={analysis.pose}
            highlight={measurement.angle}
            label={t('pose.degrees', { value: Math.round(measurement.value) })}
            angles={measurement.joints?.map((joint) => ({ ...joint, label: t('pose.degrees', { value: Math.round(joint.value) }) }))}
            maxWidth={canvasWidth}
            onChange={(pose) => setAnalysis({ ...analysis, pose })}
          />
          <Body style={styles.center}>{noPerson ? t('pose.noPerson') : uncertain ? t('pose.uncertain') : t('pose.adjustHint')}</Body>
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
            {measurement.joints ? (
              <View style={styles.joints}>
                <Label>{t('pose.jointAngles')}</Label>
                {measurement.joints.map((joint, index) => (
                  <View key={joint.id} style={styles.jointRow}>
                    <Body style={index === 0 ? styles.jointStrong : undefined}>{t(`pose.joints.${joint.id}`)}</Body>
                    <Body style={index === 0 ? styles.jointStrong : undefined}>{t('pose.degrees', { value: Math.round(joint.value) })}</Body>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
          <TextField value={note} onChangeText={setNote} placeholder={t('pose.notePlaceholder')} maxLength={200} />
          <ActionButton icon="checkmark" label={t('pose.save')} disabled={Boolean(busy)} onPress={() => void save()} />
        </>
      ) : null}
    </Screen>
  );
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
  chipRow: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  sourceLabel: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  iconCircle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  frames: { gap: 10 },
  frameStrip: { gap: 8 },
  frame: { width: 72, height: 96, borderRadius: 10, borderWidth: 3 },
  frameTime: { fontFamily: fonts.medium, fontSize: 12, textAlign: 'center', marginTop: 2 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  error: { fontFamily: fonts.medium, fontSize: 14, textAlign: 'center' },
  center: { textAlign: 'center' },
  result: { gap: 10 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  warning: { fontFamily: fonts.medium, fontSize: 14 },
  joints: { gap: 4 },
  jointRow: { flexDirection: 'row', justifyContent: 'space-between' },
  jointStrong: { fontFamily: fonts.display, fontSize: 17 },
});
