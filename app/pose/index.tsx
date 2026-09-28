import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { poseDetectionAvailable } from '../../src/features/pose/detectPose';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { PositionAccordion } from '../../src/features/pose/PositionPicker';
import { listPoseCaptures, type PoseCapture } from '../../src/features/pose/repository';
import { findPosition } from '../../src/domain/pose';
import { ActionButton, PageHeading, Screen } from '../../src/shared/components/ui';

export default function PoseOverviewScreen() {
  const { t, i18n } = useTranslation();
  const [latest, setLatest] = useState<Map<string, PoseCapture> | null>(null);

  useFocusEffect(useCallback(() => {
    if (!poseDetectionAvailable) return;
    let mounted = true;
    void listPoseCaptures().then((captures) => {
      if (!mounted) return;
      const byPosition = new Map<string, PoseCapture>();
      for (const capture of captures) if (!byPosition.has(capture.positionId)) byPosition.set(capture.positionId, capture);
      setLatest(byPosition);
    });
    return () => { mounted = false; };
  }, []));

  if (!poseDetectionAvailable) return <Screen><PageHeading title={t('pose.title')} subtitle={t('pose.unavailable')} /></Screen>;
  // Wait for the captures so groups that already have checks can open straight away.
  if (!latest) return <Screen><PageHeading title={t('pose.title')} subtitle={t('pose.subtitle')} /></Screen>;

  const measuredGroups = [...new Set([...latest.keys()].flatMap((id) => findPosition(id)?.group ?? []))];

  return (
    <Screen>
      <PageHeading title={t('pose.title')} subtitle={t('pose.subtitle')} />
      <ActionButton icon="scan-outline" label={t('pose.newCheck')} onPress={() => router.push('/pose/new')} />
      <PositionAccordion
        initiallyOpen={measuredGroups}
        subtitle={(position) => {
          const capture = latest.get(position.id);
          return capture
            ? `${t('pose.degrees', { value: Math.round(capture.value) })} · ${capture.capturedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}`
            : t(`pose.positions.${position.id}.how`);
        }}
        trailing={(position) => {
          const capture = latest.get(position.id);
          return capture ? <LevelBadge level={capture.level} compact /> : undefined;
        }}
        onSelect={(id) => router.push({ pathname: '/pose/[positionId]', params: { positionId: id } })}
      />
    </Screen>
  );
}
