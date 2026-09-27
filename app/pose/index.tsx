import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { POSITIONS } from '../../src/domain/pose';
import { poseDetectionAvailable } from '../../src/features/pose/detectPose';
import { LevelBadge } from '../../src/features/pose/LevelBadge';
import { listPoseCaptures, type PoseCapture } from '../../src/features/pose/repository';
import { ActionButton, ListGroup, ListRow, PageHeading, Screen } from '../../src/shared/components/ui';

export default function PoseOverviewScreen() {
  const { t, i18n } = useTranslation();
  const [latest, setLatest] = useState<Map<string, PoseCapture>>(new Map());

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

  return (
    <Screen>
      <PageHeading title={t('pose.title')} subtitle={t('pose.subtitle')} />
      <ActionButton icon="scan-outline" label={t('pose.newCheck')} onPress={() => router.push('/pose/new')} />
      <ListGroup>
        {POSITIONS.map((position) => {
          const capture = latest.get(position.id);
          const subtitle = capture
            ? `${t('pose.degrees', { value: Math.round(capture.value) })} · ${capture.capturedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}`
            : t(`pose.positions.${position.id}.how`);
          return (
            <ListRow
              key={position.id}
              icon="body-outline"
              title={t(`pose.positions.${position.id}.name`)}
              subtitle={subtitle}
              onPress={() => router.push({ pathname: '/pose/[positionId]', params: { positionId: position.id } })}
              trailing={capture ? <LevelBadge level={capture.level} compact /> : undefined}
            />
          );
        })}
      </ListGroup>
    </Screen>
  );
}
