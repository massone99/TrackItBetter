import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { displayedAngle, findPosition, nextLevelTarget, POSITIONS, type JointAngleId } from '../../src/domain/pose';
import { OverlayLegend, useOverlaySettings } from '../../src/features/pose/OverlayLegend';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { JointPicker, useJointSelection } from '../../src/features/pose/JointPicker';
import { PoseCanvas } from '../../src/features/pose/PoseCanvas';
import { deletePoseCapture, listPoseCaptures, type PoseCapture } from '../../src/features/pose/repository';
import {
  ActionButton,
  Body,
  Card,
  EmptyState,
  IconButton,
  Label,
  ListGroup,
  ListRow,
  Numeral,
  PageHeading,
  Screen,
  SectionTitle,
  SegmentedControl,
  Sheet,
  Text,
} from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

export default function PoseHistoryScreen() {
  const styles = useScaledStyles(baseStyles);
  const { positionId } = useLocalSearchParams<{ positionId: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [captures, setCaptures] = useState<PoseCapture[] | null>(null);
  const [view, setView] = useState<'latest' | 'compare'>('latest');
  const [deleting, setDeleting] = useState<PoseCapture | null>(null);
  const position = findPosition(positionId);
  const [jointIds, setJointIds] = useJointSelection(position ?? POSITIONS[0]);
  const [overlay, setOverlay] = useOverlaySettings();
  const [focused, setFocused] = useState<JointAngleId | null>(null);

  const reload = useCallback(async () => setCaptures(await listPoseCaptures(positionId)), [positionId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  if (!position) return <Screen><PageHeading title={t('pose.title')} subtitle={t('pose.noCaptures')} /></Screen>;
  const name = t(`pose.positions.${position.id}.name`);
  const latest = captures?.[0];
  const first = captures && captures.length > 1 ? captures[captures.length - 1] : null;
  const contentWidth = Math.min(windowWidth - 40, 600);
  const date = (capture: PoseCapture) => capture.capturedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const sideLabel = (capture: PoseCapture) => capture.side === 'left' ? t('pose.sideLeft') : capture.side === 'right' ? t('pose.sideRight') : null;

  // A free analysis lists the picked joint angles instead of one value and a level.
  const freeSummary = (capture: PoseCapture) => (position.measure(capture.pose, (capture.side as 'left' | 'right' | null)).joints ?? [])
    .filter((joint) => jointIds.includes(joint.id))
    .map((joint) => `${t(`pose.jointsShort.${joint.id}`)} ${t('pose.degrees', { value: Math.round(joint.value) })}`)
    .join(' · ') || date(capture);

  const canvas = (capture: PoseCapture, width: number) => {
    const measurement = position.measure(capture.pose, position.sideAware ? (capture.side as 'left' | 'right' | null) : null);
    return (
      <PoseCanvas
        uri={capture.uri}
        imageWidth={capture.width}
        imageHeight={capture.height}
        pose={capture.pose}
        highlight={displayedAngle(position, measurement, jointIds, focused).angle}
        label={t('pose.degrees', { value: Math.round(position.generic ? displayedAngle(position, measurement, jointIds, focused).value : capture.value) })}
        settings={overlay}
        focused={focused}
        angles={measurement.joints?.filter((joint) => jointIds.includes(joint.id)).map((joint) => ({ ...joint, name: t(`pose.jointsShort.${joint.id}`), value: t('pose.degrees', { value: Math.round(joint.value) }) }))}
        maxWidth={width}
        maxHeight={width === contentWidth ? 440 : 300}
        editable={false}
      />
    );
  };

  return (
    <Screen>
      <PageHeading
        title={name}
        subtitle={t(`pose.positions.${position.id}.how`)}
        action={<IconButton icon="add" tone="accent" label={t('pose.newCheck')} onPress={() => router.push({ pathname: '/pose/new', params: { positionId: position.id } })} />}
      />

      {captures && captures.length === 0 ? (
        <EmptyState
          icon="scan-outline"
          title={t('pose.newCheck')}
          body={t('pose.noCaptures')}
          action={<View style={styles.stretch}><ActionButton icon="scan-outline" label={t('pose.newCheck')} onPress={() => router.push({ pathname: '/pose/new', params: { positionId: position.id } })} /></View>}
        />
      ) : null}

      {latest ? (
        <>
          {position.generic ? null : <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <View>
                <Label>{t(`pose.positions.${position.id}.metric`)}</Label>
                <Numeral>{t('pose.degrees', { value: Math.round(latest.value) })}</Numeral>
              </View>
              <LevelBadge level={latest.level} />
            </View>
            <Body>
              {(() => {
                const target = nextLevelTarget(position, latest.value);
                return target === null ? t('pose.topLevel') : t('pose.nextTarget', { value: target });
              })()}
            </Body>
            {first ? <Text style={[styles.change, { color: palette.accentStrong }]}>{t('pose.change', { value: `${latest.value - first.value > 0 ? '+' : ''}${Math.round(latest.value - first.value)}` })}</Text> : null}
            <Trend captures={captures ?? []} better={position.better} />
          </Card>}

          <JointPicker position={position} selected={jointIds} onChange={setJointIds} />
          {first ? (
            <SegmentedControl value={view} onChange={setView} options={[{ value: 'latest', label: date(latest) }, { value: 'compare', label: t('pose.compare') }]} />
          ) : null}
          {view === 'compare' && first ? (
            <View style={styles.compare}>
              <View style={styles.compareItem}>{canvas(first, (contentWidth - 10) / 2)}<Label style={styles.centerText}>{date(first)}</Label></View>
              <View style={styles.compareItem}>{canvas(latest, (contentWidth - 10) / 2)}<Label style={styles.centerText}>{date(latest)}</Label></View>
            </View>
          ) : canvas(latest, contentWidth)}
          <OverlayLegend
            angles={(position.measure(latest.pose, position.sideAware ? (latest.side as 'left' | 'right' | null) : null).joints ?? [])
              .filter((joint) => jointIds.includes(joint.id))
              .map((joint) => ({ id: joint.id, name: t(`pose.jointsShort.${joint.id}`), value: t('pose.degrees', { value: Math.round(joint.value) }) }))}
            settings={overlay}
            focused={focused}
            onSettings={setOverlay}
            onFocus={setFocused}
          />

          <SectionTitle title={t('pose.history')} />
          <ListGroup>
            {(captures ?? []).map((capture) => (
              <ListRow
                key={capture.id}
                title={position.generic ? freeSummary(capture) : `${t('pose.degrees', { value: Math.round(capture.value) })} · ${t('pose.level', { level: capture.level })}`}
                subtitle={[date(capture), sideLabel(capture), capture.note || null].filter(Boolean).join(' · ')}
                trailing={<IconButton icon="trash-outline" label={t('pose.delete')} tone="plain" size={34} onPress={() => setDeleting(capture)} />}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)} title={t('pose.delete')} body={t('pose.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void deletePoseCapture(target.id).then(reload);
        }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setDeleting(null)} />
      </Sheet>
    </Screen>
  );
}

/** Oldest → newest bars; taller always means better, whichever direction the angle improves. */
function Trend({ captures, better }: { captures: PoseCapture[]; better: 'higher' | 'lower' }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const points = [...captures].reverse().slice(-16);
  if (points.length < 2) return null;
  const values = points.map((capture) => capture.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return (
    <View style={styles.trend}>
      {points.map((capture, index) => {
        const quality = better === 'higher' ? (capture.value - min) / span : (max - capture.value) / span;
        return (
          <View key={capture.id} style={styles.trendColumn}>
            <View style={[styles.trendBar, { height: `${20 + quality * 80}%`, backgroundColor: index === points.length - 1 ? palette.record : palette.accentSoft }]} />
          </View>
        );
      })}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  stretch: { alignSelf: 'stretch', marginTop: 6 },
  summary: { gap: 8 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  change: { fontFamily: fonts.semibold, fontSize: 14 },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64, marginTop: 6 },
  trendColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  trendBar: { borderRadius: 4, width: '100%' },
  compare: { flexDirection: 'row', gap: 10 },
  compareItem: { flex: 1, minWidth: 0, gap: 10 },
  centerText: { textAlign: 'center' },
});
