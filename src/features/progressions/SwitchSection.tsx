import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { switchOptions, switchSignal, type SwitchOption } from '../../domain/switchOptions';
import { Body, ListGroup, ListRow, MenuGroup } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { formatClock } from '../../shared/utils/format';
import type { SessionExercise } from '../session/repository';
import { getExerciseProgressions, type ExerciseProgressions } from './chains';

const ICON = { easier: 'arrow-down', harder: 'arrow-up', variation: 'swap-horizontal', prerequisite: 'lock-open-outline' } as const;

/**
 * "Switch to" in an exercise's options during a workout: the exercises of its progression tree one tap away,
 * the one your sets point to first (easier after a set at the limit, harder once its target is reached).
 */
export function SwitchSection({ exercise, onSwitch, onOther }: {
  exercise: SessionExercise;
  onSwitch: (id: string, name: string) => void;
  onOther: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [data, setData] = useState<ExerciseProgressions | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getExerciseProgressions(exercise.exerciseId).then((next) => { if (alive) { setData(next); setFailed(false); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [exercise.exerciseId, attempt]);

  if (failed) {
    return <MenuGroup title={t('chains.switchTitle')}><ListGroup><ListRow icon="alert-circle-outline" title={t('chains.loadError')} subtitle={t('common.tryAgain')} onPress={() => setAttempt((value) => value + 1)} /></ListGroup></MenuGroup>;
  }
  if (!data) return <MenuGroup title={t('chains.switchTitle')}><ActivityIndicator color={palette.accentStrong} /></MenuGroup>;

  const signal = switchSignal(
    exercise.sets.map((set) => ({ kind: set.kind === 'warmup' ? 'warmup' : 'working', completed: set.completedAt !== null, rpe: set.rpe, targetRpe: set.targetRpe })),
    data.reached.has(exercise.exerciseId),
  );
  const options = switchOptions(data.tree, signal);
  const nameOf = (id: string) => data.names.get(id) ?? id;
  const best = (id: string) => {
    const value = data.best.get(id);
    return value?.seconds ? t('chains.bestSeconds', { time: formatClock(value.seconds) }) : value?.reps ? t('chains.bestReps', { count: value.reps }) : null;
  };
  const subtitle = (option: SwitchOption) => [
    option.suggested ? t(option.relation === 'easier' ? 'chains.suggestEasier' : 'chains.suggestHarder') : t(`chains.relation.${option.relation}`),
    best(option.id),
  ].filter(Boolean).join(' · ');

  return (
    <MenuGroup title={t('chains.switchTitle')}>
      {options.length === 0 ? <Body>{t('chains.switchEmpty')}</Body> : null}
      <ListGroup>
        {options.map((option) => (
          <ListRow
            key={option.id}
            icon={ICON[option.relation]}
            title={nameOf(option.id)}
            subtitle={subtitle(option)}
            selected={option.suggested}
            onPress={() => onSwitch(option.id, nameOf(option.id))}
          />
        ))}
        {options.length === 0 ? <ListRow icon="git-network-outline" title={t('chains.switchLink')} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })} /> : null}
        <ListRow icon="search-outline" title={t('chains.switchOther')} onPress={onOther} />
      </ListGroup>
    </MenuGroup>
  );
}
