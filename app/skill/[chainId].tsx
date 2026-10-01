import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/shared/components/Text';
import type { ProgressionTarget } from '../../src/domain/progression';
import { getProgressionChain } from '../../src/features/progressions/repository';
import { Body, Card, Heading, Label, PageHeading, Screen, Icon } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

type Chain = Awaited<ReturnType<typeof getProgressionChain>>;

export default function SkillScreen() {
  const styles = useScaledStyles(baseStyles);
  const { chainId } = useLocalSearchParams<{ chainId: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [chain, setChain] = useState<Chain>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    void getProgressionChain(chainId).then((result) => {
      if (current) { setChain(result); setLoading(false); }
    });
    return () => { current = false; };
  }, [chainId]);

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!chain) return <Screen><PageHeading title={t('progression.title')} subtitle={t('progression.missing')} /></Screen>;

  const targetText = (target: ProgressionTarget | null) => {
    if (!target) return t('progression.targetMissing');
    const metric = target.reps !== undefined
      ? `${target.reps} ${t('progression.reps')}`
      : `${target.durationSec ?? 0} ${t('progression.seconds')}`;
    return `${target.sets} × ${metric}`;
  };

  return (
    <Screen>
      <PageHeading title={chain.name} subtitle={chain.description} />
      {chain.suggestion && (
        <Card style={[styles.suggestion, { borderColor: palette.success }]}>
          <Label>{t('progression.nextStep')}</Label>
          <Heading style={styles.suggestionTitle}>
            {chain.suggestion.kind === 'advance'
              ? t('progression.advance', { name: chain.suggestion.nextExerciseName })
              : chain.suggestion.kind === 'increase'
                ? t('progression.increase')
                : chain.suggestion.kind === 'repeat'
                  ? t('progression.repeat', {
                    count: chain.suggestion.consecutiveSuccessfulSessions,
                    required: chain.suggestion.requiredSessions,
                  })
                  : t('progression.startAtLevel', { number: chain.suggestion.level ?? 1 })}
          </Heading>
          <Body>
            {t('progression.aimFor', { target: targetText(chain.suggestion.suggestedTarget) })}
          </Body>
        </Card>
      )}
      <View style={styles.path}>
        {chain.levels.map((level, index) => {
          const levelNumber = level.level ?? index + 1;
          return (
            <View key={level.id} style={styles.levelRow}>
              <View style={styles.markerColumn}>
              <View style={[styles.marker, { backgroundColor: palette.accent }]}><Text style={{ color: palette.accentText, fontSize: 12, fontWeight: '900' }}>{levelNumber}</Text></View>
                {index < chain.levels.length - 1 && <View style={[styles.connector, { backgroundColor: palette.border }]} />}
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: level.id } })} style={styles.levelContent}>
                <Card style={styles.levelCard}>
                  <Label>{t('progression.level', { number: levelNumber })}</Label>
                  <View style={styles.levelTitle}><Heading style={styles.exerciseName}>{level.name}</Heading><Icon name="chevron-forward" size={18} color={palette.textMuted} /></View>
                  <Body>{targetText(level.target)} · {t('progression.sessions', { count: level.requiredSessions })}</Body>
                </Card>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  suggestion: { gap: 7, marginBottom: 18 },
  suggestionTitle: { fontSize: 17 },
  path: { gap: 4 },
  levelRow: { minHeight: 112, flexDirection: 'row', gap: 13 },
  markerColumn: { width: 30, alignItems: 'center' },
  marker: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  connector: { flex: 1, width: 2, marginVertical: 4 },
  levelContent: { flex: 1, paddingBottom: 12 },
  levelCard: { flex: 1, gap: 7, paddingVertical: 13, borderRadius: 17 },
  levelTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16 },
});
