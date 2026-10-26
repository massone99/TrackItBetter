import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActionButton, Body, Card, Label, Numeral, SegmentedControl, Tag, Text, Title } from '../components/ui';
import { FONT_OPTIONS, FONT_ROLES, presetOf, sampleFont, type FontFamilyId, type FontPresetId, type FontRole } from '../theme/fontChoices';
import { useInk } from '../theme/ink';
import { useTheme } from '../theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';
import { useScaledStyles } from '../theme/useScaledStyles';

/** Sample weight of each role's tile: the weight that role mostly uses in the app. */
const SAMPLE: Record<FontRole, { weight: 400 | 600 | 700; text: string; size: number }> = {
  body: { weight: 600, text: 'Aa Bb Gg', size: 20 },
  display: { weight: 700, text: 'AA BB GG', size: 24 },
  mono: { weight: 700, text: '0123 8×6', size: 18 },
};

/**
 * Font settings: a live preview made of the app's own components, three presets, and one chooser per role
 * (text, titles, figures) whose tiles are drawn in the font they stand for.
 */
export function FontSettings() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, fontSelection, setFontFamily, setFontPreset } = useTheme();
  const ink = useInk();
  const preset = presetOf(fontSelection);
  const presetOptions: { value: FontPresetId | 'custom'; label: string }[] = [
    { value: 'technical', label: t('profile.fontPresetTechnical') },
    { value: 'classic', label: t('profile.fontPresetClassic') },
    { value: 'system', label: t('profile.fontPresetSystem') },
  ];
  return (
    <>
      <Card>
        <Tag>{t('profile.fontPreview')}</Tag>
        <Title>{t('profile.fontSampleTitle')}</Title>
        <Body>{t('profile.fontSampleBody')}</Body>
        <View style={[styles.figures, { borderColor: ink, backgroundColor: palette.background }]}>
          <View style={styles.figure}>
            <Tag>{t('profile.fontSampleKg')}</Tag>
            <Numeral style={styles.figureValue}>62,5</Numeral>
          </View>
          <View style={[styles.figure, styles.figureDivided, { borderLeftColor: palette.border }]}>
            <Tag>{t('profile.fontSampleReps')}</Tag>
            <Numeral style={styles.figureValue}>8</Numeral>
          </View>
        </View>
        <ActionButton label={t('profile.fontSampleAction')} onPress={() => undefined} />
      </Card>

      <Card>
        <Label>{t('profile.fontPreset')}</Label>
        <SegmentedControl<FontPresetId | 'custom'>
          value={preset ?? 'custom'}
          onChange={(next) => { if (next !== 'custom') setFontPreset(next); }}
          options={preset === null ? [...presetOptions, { value: 'custom', label: t('profile.fontPresetCustom') }] : presetOptions}
        />
        {FONT_ROLES.map((role) => (
          <View key={role} style={styles.role}>
            <Label>{t(`profile.fontRole.${role}`)}</Label>
            <View style={styles.tiles}>
              {FONT_OPTIONS[role].map((family: FontFamilyId) => {
                const selected = fontSelection[role] === family;
                return (
                  <Pressable
                    key={family}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${t(`profile.fontRole.${role}`)}: ${t(`profile.fontFamily.${family}`)}`}
                    onPress={() => setFontFamily(role, family)}
                    style={[styles.tile, { borderColor: ink, backgroundColor: selected ? ink : palette.surface }]}
                  >
                    <Text fixedFont style={[sampleFont(role, family, SAMPLE[role].weight), { fontSize: SAMPLE[role].size, lineHeight: SAMPLE[role].size + 6, color: selected ? palette.surface : palette.text }]}>{SAMPLE[role].text}</Text>
                    <Text fixedFont style={[sampleFont('mono', 'plex', 600), styles.tileName, { color: selected ? palette.surface : palette.textMuted }]}>{t(`profile.fontFamily.${family}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Body>{t('profile.fontHint')}</Body>
      </Card>
    </>
  );
}

const baseStyles = StyleSheet.create({
  figures: { flexDirection: 'row', borderWidth: instrument.line, borderRadius: radii.control },
  figure: { flex: 1, minHeight: MIN_TOUCH_TARGET + spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  figureDivided: { borderLeftWidth: StyleSheet.hairlineWidth },
  figureValue: { fontSize: 24, lineHeight: 30 },
  role: { gap: spacing.sm, marginTop: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 96, minHeight: MIN_TOUCH_TARGET + spacing.lg, borderWidth: instrument.line, borderRadius: radii.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center', gap: spacing.xs },
  tileName: { fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1 },
});
