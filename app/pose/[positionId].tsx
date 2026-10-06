import { LoadError } from '../../src/shared/components/LoadError';
import { Paged } from '../../src/shared/components/paging';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { displayedAngle, findPosition, nextLevelTarget, POSITIONS, type JointAngleId, type PositionDefinition } from '../../src/domain/pose';
import { OverlayLegend, useOverlaySettings } from '../../src/features/pose/OverlayLegend';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { JointPicker, useJointSelection } from '../../src/features/pose/JointPicker';
import { PoseCanvas } from '../../src/features/pose/PoseCanvas';
import { deletePoseCapture, linkPoseCapture, listPoseCaptures, type PoseCapture } from '../../src/features/pose/repository';
import { describeLink, PoseLinkSheet } from '../../src/features/pose/PoseLink';
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
  // The page shows one exercise's analyses at a time (unlinked ones together). From an exercise it opens
  // on that exercise; from a set, on the set's latest analysis; `captureId` opens one analysis.
  const params = useLocalSearchParams<{ positionId: string; exerciseId?: string; setId?: string; captureId?: string }>();
  const { positionId } = params;
  const [group, setGroup] = useState<string | null>(params.exerciseId ?? null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.captureId ?? null);
  const [linking, setLinking] = useState<PoseCapture | null>(null);
  // In the comparison: the analysis set against the one on show (the oldest unless one is tapped).
  const [compareId, setCompareId] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [all, setAll] = useState<PoseCapture[] | null>(null);
  const [view, setView] = useState<'latest' | 'compare'>('latest');
  const [deleting, setDeleting] = useState<PoseCapture | null>(null);
  const position = findPosition(positionId);
  const [jointIds, setJointIds] = useJointSelection(position ?? POSITIONS[0]);
  const [overlay, setOverlay] = useOverlaySettings();
  const [focused, setFocused] = useState<JointAngleId | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const reload = useCallback(async () => {
    try {
      setAll(await listPoseCaptures(positionId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [positionId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  if (!position) return <Screen><PageHeading title={t('pose.title')} subtitle={t('pose.noCaptures')} /></Screen>;
  const name = t(`pose.positions.${position.id}.name`);
  const keyOf = (capture: PoseCapture) => capture.link?.exerciseId ?? '';
  // Groups by exercise, most recent first; the unlinked ones form their own group.
  const groups = [...new Map((all ?? []).map((capture) => [keyOf(capture), capture.link?.exerciseName ?? null] as const))]
    .map(([key, exerciseName]) => ({ key, name: exerciseName ?? t('poseLink.unlinked'), count: (all ?? []).filter((capture) => keyOf(capture) === key).length }));
  const fromSet = params.setId ? all?.find((capture) => capture.link?.set?.id === params.setId) : undefined;
  const wanted = group ?? (fromSet ? keyOf(fromSet) : null) ?? (selectedId ? all?.find((capture) => capture.id === selectedId)?.link?.exerciseId ?? '' : null);
  // A group emptied by a relink or a delete falls back to the most recent one.
  const groupKey = groups.some((item) => item.key === wanted) ? wanted! : groups[0]?.key ?? '';
  const captures = all?.filter((capture) => keyOf(capture) === groupKey) ?? null;
  const current = groups.find((item) => item.key === groupKey);
  // The one on show: the analysis tapped in the list (or the set's), else the latest.
  const latest = captures?.find((capture) => capture.id === (selectedId ?? fromSet?.id)) ?? captures?.[0];
  const first = captures && captures.length > 1 ? captures[captures.length - 1] : null;
  // An analysis is compared only with others of the same exercise (unlinked ones with each other).
  const sameExercise = (capture: PoseCapture) => latest !== undefined && capture.id !== latest.id && (capture.link?.exerciseId ?? null) === (latest.link?.exerciseId ?? null);
  const comparable = captures?.filter(sameExercise) ?? [];
  const other = comparable.find((capture) => capture.id === compareId) ?? comparable[comparable.length - 1] ?? null;
  // Older on the left, newer on the right.
  const pair = latest && other ? (other.capturedAt <= latest.capturedAt ? [other, latest] : [latest, other]) : null;
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

      {/* Analyses are only ever compared within one exercise, so the page shows one exercise at a time. */}
      {groups.length > 1 && current ? (
        <ListGroup>
          <ListRow
            icon="barbell-outline"
            title={current.name}
            subtitle={t('poseLink.exerciseSwitch', { count: current.count })}
            onPress={() => setGroupsOpen(true)}
          />
        </ListGroup>
      ) : null}

      {loadFailed ? <LoadError onRetry={() => void reload()} /> : null}
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
          {other ? (
            <SegmentedControl value={view} onChange={setView} options={[{ value: 'latest', label: date(latest) }, { value: 'compare', label: t('pose.compare') }]} />
          ) : null}
          {view === 'compare' && pair ? (
            <>
              <View style={styles.compare}>
                {pair.map((capture) => (
                  <View key={capture.id} style={styles.compareItem}>{canvas(capture, (contentWidth - 10) / 2)}<Label style={styles.centerText}>{date(capture)}</Label></View>
                ))}
              </View>
              <CompareTable position={position} older={pair[0]} newer={pair[1]} jointIds={jointIds} />
              <Body>{t('pose.compareHint', { date: date(latest) })}</Body>
            </>
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
            {/* While comparing, only the analyses of the same exercise are listed. */}
            <Paged items={view === 'compare' && other ? (captures ?? []).filter((capture) => capture.id === latest.id || sameExercise(capture)) : captures ?? []} pageSize={20} resetKey={`${groupKey}:${view}`}>
              {(shownCaptures) => <>
            {shownCaptures.map((capture) => (
              <ListRow
                key={capture.id}
                title={position.generic ? freeSummary(capture) : `${t('pose.degrees', { value: Math.round(capture.value) })} · ${t('pose.level', { level: capture.level })}`}
                subtitle={[date(capture), sideLabel(capture), describeLink(capture.link, t, i18n.language), capture.note || null].filter(Boolean).join(' · ')}
                selected={(captures ?? []).length > 1 ? capture.id === latest.id || (view === 'compare' && capture.id === other?.id) : undefined}
                // While comparing, a tap picks the analysis to set against the one on show.
                onPress={() => { if (view !== 'compare') setSelectedId(capture.id); else if (sameExercise(capture)) setCompareId(capture.id); }}
                trailing={(
                  <View style={styles.rowActions}>
                    {position.generic ? <IconButton icon="link-outline" label={t('poseLink.title')} tone="plain" size={34} onPress={() => setLinking(capture)} /> : null}
                    <IconButton icon="trash-outline" label={t('pose.delete')} tone="plain" size={34} onPress={() => setDeleting(capture)} />
                  </View>
                )}
              />
            ))}
              </>}
            </Paged>
          </ListGroup>
        </>
      ) : null}

      <Sheet visible={groupsOpen} onClose={() => setGroupsOpen(false)} title={t('poseLink.exercisePick')}>
        <ListGroup>
          {groups.map((item) => (
            <ListRow
              key={item.key}
              title={item.name}
              subtitle={t('poseLink.exerciseOpen', { count: item.count })}
              selected={item.key === groupKey}
              onPress={() => { setGroup(item.key); setSelectedId(null); setCompareId(null); setView('latest'); setGroupsOpen(false); }}
            />
          ))}
        </ListGroup>
      </Sheet>

      <PoseLinkSheet
        visible={linking !== null}
        value={linking?.link ?? null}
        onChange={(link) => { if (linking) void linkPoseCapture(linking.id, link ? { exerciseId: link.exerciseId, setId: link.set?.id ?? null } : null).then(reload); }}
        onClose={() => setLinking(null)}
      />

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

/** The picked joint angles (and a position's own measure) of two analyses, with the change between them. */
function CompareTable({ position, older, newer, jointIds }: { position: PositionDefinition; older: PoseCapture; newer: PoseCapture; jointIds: readonly JointAngleId[] }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const measure = (capture: PoseCapture) => position.measure(capture.pose, position.sideAware ? (capture.side as 'left' | 'right' | null) : null);
  const before = measure(older);
  const after = measure(newer);
  const rows = [
    ...(position.generic ? [] : [{ id: 'main', name: t(`pose.positions.${position.id}.metric`), a: older.value, b: newer.value }]),
    ...jointIds.map((id) => ({
      id,
      name: t(`pose.jointsShort.${id}`),
      a: before.joints?.find((joint) => joint.id === id)?.value ?? null,
      b: after.joints?.find((joint) => joint.id === id)?.value ?? null,
    })),
  ];
  if (rows.length === 0) return null;
  const degrees = (value: number | null) => (value === null ? '–' : t('pose.degrees', { value: Math.round(value) }));
  return (
    <Card style={styles.table}>
      {rows.map((row) => {
        const delta = row.a !== null && row.b !== null ? Math.round(row.b - row.a) : null;
        return (
          <View key={row.id} style={styles.tableRow} accessible accessibilityLabel={`${row.name}: ${degrees(row.a)} → ${degrees(row.b)}${delta === null ? '' : `, ${t('pose.compareDiff')} ${delta > 0 ? '+' : ''}${delta}°`}`}>
            <Text style={[styles.tableName, { color: palette.text }]}>{row.name}</Text>
            <Text style={[styles.tableValue, { color: palette.textMuted }]}>{degrees(row.a)}</Text>
            <Text style={[styles.tableValue, { color: palette.text }]}>{degrees(row.b)}</Text>
            <Text style={[styles.tableValue, styles.tableDelta, { color: palette.accentStrong }]}>{delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta}°`}</Text>
          </View>
        );
      })}
    </Card>
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
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  table: { gap: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  tableName: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  tableValue: { minWidth: 48, textAlign: 'right', fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  tableDelta: { minWidth: 56 },
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
