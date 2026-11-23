import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Card, Chip, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Text } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { radii, spacing } from '../src/shared/theme/tokens';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

const SECTIONS = ['continuum', 'fatigue', 'balance', 'periodization'] as const;
type SectionId = (typeof SECTIONS)[number];

function initialSection(raw: string | string[] | undefined): SectionId | 'all' {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (SECTIONS as readonly string[]).includes(value ?? '') ? (value as SectionId) : 'all';
}

const CONTINUUM_ROWS = [
  { key: 'max', reps: '1–3', hold: '2–6 s', rest: '3–5 min' },
  { key: 'strength', reps: '3–5', hold: '6–10 s', rest: '3–4 min' },
  { key: 'hypertrophy', reps: '6–12', hold: '12–24 s', rest: '1.5–3 min' },
  { key: 'upperHyp', reps: '12–15', hold: '24–30 s', rest: '1–2 min' },
  { key: 'endurance', reps: '15+', hold: '30 s+', rest: '30–90 s' },
] as const;

const LEVEL_ROWS = ['untrained', 'trained', 'intermediate', 'advanced'] as const;

/**
 * Calm, offline reference of the core Overcoming Gravity training frameworks embedded across the app.
 * Reached from Profile or contextually from Estimator, Progress, and Program Builder—never forced.
 */
export default function PrinciplesScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const [selected, setSelected] = useState<SectionId | 'all'>(() => initialSection(params.section));
  const show = (id: SectionId) => selected === 'all' || selected === id;

  return (
    <Screen>
      <PageHeading title={t('principles.title')} subtitle={t('principles.subtitle')} />

      <View style={styles.chips}>
        <Chip label={t('principles.all')} selected={selected === 'all'} onPress={() => setSelected('all')} />
        {SECTIONS.map((id) => (
          <Chip key={id} label={t(`principles.tabs.${id}`)} selected={selected === id} onPress={() => setSelected(id)} />
        ))}
      </View>

      {show('continuum') ? (
        <Card>
          <SectionTitle title={t('principles.continuum.title')} />
          <Body>{t('principles.continuum.intro')}</Body>
          <View style={styles.rows}>
            {CONTINUUM_ROWS.map((row) => (
              <View key={row.key} style={[styles.tableRow, { borderColor: palette.border }]}>
                <View style={styles.tableCopy}>
                  <Text style={[styles.rowTitle, { color: palette.text }]}>{t(`principles.continuum.rows.${row.key}`)}</Text>
                  <Text style={[styles.rowMeta, { color: palette.textMuted }]}>{`${row.reps} ${t('progression.reps')} · ${row.hold}`}</Text>
                </View>
                <Text style={[styles.rowBadge, { color: palette.accentStrong }]}>{row.rest}</Text>
              </View>
            ))}
          </View>
          <Label>{t('principles.continuum.isometricsTitle')}</Label>
          <Body>{t('principles.continuum.isometricsBody')}</Body>
          <Label>{t('principles.continuum.pairedTitle')}</Label>
          <Body>{t('principles.continuum.pairedBody')}</Body>
        </Card>
      ) : null}

      {show('fatigue') ? (
        <Card>
          <SectionTitle title={t('principles.fatigue.title')} />
          <Body>{t('principles.fatigue.intro')}</Body>
          <View style={[styles.callout, { borderColor: palette.border }]}>
            <Text style={[styles.formula, { color: palette.accentStrong }]}>{t('principles.fatigue.formula')}</Text>
            <Body>{t('principles.fatigue.formulaBody')}</Body>
          </View>
          <Label>{t('principles.fatigue.deloadTitle')}</Label>
          <Body>{t('principles.fatigue.deloadBody')}</Body>
          <Label>{t('principles.fatigue.overreachingTitle')}</Label>
          <Body>{t('principles.fatigue.overreachingBody')}</Body>
        </Card>
      ) : null}

      {show('balance') ? (
        <Card>
          <SectionTitle title={t('principles.balance.title')} />
          <Body>{t('principles.balance.intro')}</Body>
          <Label>{t('principles.balance.tissuesTitle')}</Label>
          <Body>{t('principles.balance.tissuesBody')}</Body>
          <Label>{t('principles.balance.hierarchyTitle')}</Label>
          <Body>{t('principles.balance.hierarchyBody')}</Body>
          <Label>{t('principles.balance.attributesTitle')}</Label>
          <Body>{t('principles.balance.attributesBody')}</Body>
        </Card>
      ) : null}

      {show('periodization') ? (
        <Card>
          <SectionTitle title={t('principles.periodization.title')} />
          <Body>{t('principles.periodization.intro')}</Body>
          <View style={styles.rows}>
            {LEVEL_ROWS.map((level) => (
              <View key={level} style={[styles.levelBlock, { borderColor: palette.border }]}>
                <Text style={[styles.rowTitle, { color: palette.text }]}>{t(`principles.periodization.levels.${level}.title`)}</Text>
                <Body>{t(`principles.periodization.levels.${level}.body`)}</Body>
              </View>
            ))}
          </View>
          <Label>{t('principles.periodization.bridgeTitle')}</Label>
          <Body>{t('principles.periodization.bridgeBody')}</Body>
        </Card>
      ) : null}

      <ListGroup>
        <ListRow icon="calculator-outline" title={t('principles.openEstimator')} subtitle={t('principles.openEstimatorBody')} onPress={() => router.push('/estimator')} />
        <ListRow icon="layers-outline" title={t('principles.openPrograms')} subtitle={t('principles.openProgramsBody')} onPress={() => router.push('/(tabs)/programs')} />
      </ListGroup>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rows: { gap: spacing.sm },
  tableRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tableCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: 2 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  rowMeta: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
  rowBadge: { fontFamily: fonts.monoSemibold, fontSize: 13, lineHeight: 18 },
  callout: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, padding: spacing.md, gap: spacing.xs },
  formula: { fontFamily: fonts.monoSemibold, fontSize: 14, lineHeight: 20 },
  levelBlock: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, padding: spacing.md, gap: spacing.xs },
});
