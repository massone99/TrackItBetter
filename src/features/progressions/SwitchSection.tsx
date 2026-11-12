import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { chainLadder, switchOptions, switchSignal, type LadderStep, type SwitchOption } from '../../domain/switchOptions';
import { Body, Chip, Icon, ListGroup, ListRow, MenuGroup, tapFeedback, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';
import type { SessionExercise } from '../session/repository';
import { getExerciseProgressions, type ExerciseProgressions } from './chains';

const ICON = { easier: 'arrow-down', harder: 'arrow-up', variation: 'swap-horizontal', prerequisite: 'lock-open-outline' } as const;

/**
 * "Switch to" in an exercise's options during a workout. When the exercise is in a chain, the whole chain shows
 * as a ladder, so any step is one tap away (not only the nearest ones); the step your sets point to is marked
 * (easier after a set at the limit, harder once its target is reached). Relations outside the chain follow.
 */
export function SwitchSection({ exercise, onSwitch, onOther }: {
  exercise: SessionExercise;
  onSwitch: (id: string, name: string) => void;
  onOther: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [data, setData] = useState<ExerciseProgressions | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [chainId, setChainId] = useState<string | null>(null);

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
  const suggested = options.find((option) => option.suggested) ?? null;
  const chain = data.chains.find((item) => item.id === chainId) ?? data.chains[0] ?? null;
  const ladder = chain ? chainLadder(chain.steps, exercise.exerciseId, data.reached, suggested?.id ?? null) : [];
  const inLadder = new Set(ladder.map((step) => step.id));
  const others = options.filter((option) => !inLadder.has(option.id));
  const nameOf = (id: string) => data.names.get(id) ?? id;
  const best = (id: string) => {
    const value = data.best.get(id);
    return value?.seconds ? t('chains.bestSeconds', { time: formatClock(value.seconds) }) : value?.reps ? t('chains.bestReps', { count: value.reps }) : null;
  };
  const subtitle = (option: SwitchOption) => [
    option.suggested ? t(option.relation === 'easier' ? 'chains.suggestEasier' : 'chains.suggestHarder') : t(`chains.relation.${option.relation}`),
    best(option.id),
  ].filter(Boolean).join(' · ');
  const stepMeta = (step: LadderStep) => [
    step.state === 'suggested' && suggested ? t(suggested.relation === 'easier' ? 'chains.suggestEasier' : 'chains.suggestHarder') : null,
    best(step.id),
    data.reached.has(step.id) ? t('chains.ladderReached') : best(step.id) ? null : t('chains.ladderOpen'),
  ].filter(Boolean).join(' · ');

  return (
    <MenuGroup title={chain ? `${t('chains.switchTitle')} · ${t('chains.ladderStep', { position: chain.position, total: chain.count })}` : t('chains.switchTitle')}>
      {data.chains.length > 1 ? (
        <View style={styles.chips}>
          {data.chains.map((item) => <Chip key={item.id} label={item.name} selected={item.id === chain?.id} onPress={() => setChainId(item.id)} />)}
        </View>
      ) : null}
      {ladder.length > 0 ? (
        <ListGroup>
          {ladder.map((step, index) => (
            <LadderRow
              key={step.id}
              step={step}
              name={nameOf(step.id)}
              meta={stepMeta(step)}
              first={index === 0}
              last={index === ladder.length - 1}
              onPress={() => onSwitch(step.id, nameOf(step.id))}
            />
          ))}
        </ListGroup>
      ) : null}
      {!chain && options.length === 0 ? <Body>{t('chains.switchEmpty')}</Body> : null}
      <ListGroup>
        {others.map((option) => (
          <ListRow
            key={option.id}
            icon={ICON[option.relation]}
            title={nameOf(option.id)}
            subtitle={subtitle(option)}
            selected={option.suggested}
            onPress={() => onSwitch(option.id, nameOf(option.id))}
          />
        ))}
        {!chain && options.length === 0 ? <ListRow icon="git-network-outline" title={t('chains.switchLink')} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })} /> : null}
        <ListRow icon="search-outline" title={t('chains.switchOther')} onPress={onOther} />
      </ListGroup>
    </MenuGroup>
  );
}

/** One step of the ladder: its number on a rail (a check once reached), name, best and state. The current step is not pressable. */
function LadderRow({ step, name, meta, first, last, onPress }: { step: LadderStep; name: string; meta: string; first: boolean; last: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  const current = step.state === 'current';
  const reached = step.state === 'reached';
  const rail = (show: boolean) => ({ backgroundColor: show ? palette.border : 'transparent' });
  const badge = current
    ? { backgroundColor: palette.accentStrong, borderColor: palette.accentStrong }
    : reached ? { backgroundColor: palette.successSoft, borderColor: palette.success } : { backgroundColor: palette.surface, borderColor: ink };
  const badgeText = current ? palette.accentText : reached ? palette.success : palette.text;
  const tag = current ? t('chains.ladderNow') : step.state === 'suggested' ? t('chains.ladderSuggested') : null;
  const label = [t('chains.ladderStepLabel', { position: step.position, name }), meta, tag].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current, disabled: current }}
      disabled={current}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.row, { minHeight: Math.max(MIN_TOUCH_TARGET, styles.row.minHeight), backgroundColor: current ? palette.accentSoft : pressed ? palette.surfaceMuted : 'transparent' }, last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }]}
    >
      <View style={styles.railColumn}>
        <View style={[styles.rail, rail(!first)]} />
        <View style={[styles.badge, badge]}>
          {reached ? <Icon name="checkmark" size={14} color={badgeText} /> : <Text style={[styles.badgeText, { color: badgeText }]}>{step.position}</Text>}
        </View>
        <View style={[styles.rail, rail(!last)]} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, { color: current ? palette.accentStrong : palette.text }]}>{name}</Text>
        {meta ? <Text style={[styles.meta, { color: reached ? palette.success : palette.textMuted }]}>{meta}</Text> : null}
      </View>
      {tag ? <Text style={[styles.tag, { color: palette.accentStrong, backgroundColor: current ? 'transparent' : palette.accentSoft }]}>{tag}</Text> : null}
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md },
  railColumn: { width: 24, alignSelf: 'stretch', alignItems: 'center' },
  rail: { flex: 1, width: 2 },
  badge: { minWidth: 24, minHeight: 24, paddingHorizontal: 2, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16 },
  copy: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.sm },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 18 },
  tag: { flexShrink: 0, fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, textTransform: 'uppercase', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.control, overflow: 'hidden' },
});
