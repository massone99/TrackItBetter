import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Body, Card, Label, Numeral, SegmentedControl, Tag } from '../components/ui';
import { SET_LAYOUT_OPTIONS, type SetLayout } from '../theme/setLayout';
import { useInk } from '../theme/ink';
import { useTheme } from '../theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, radii, spacing } from '../theme/tokens';
import { useScaledStyles } from '../theme/useScaledStyles';

/** Layout of exercise cards and set buttons: a mock set row that follows the choices, and one control per choice. */
export function SetLayoutSettings() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, setLayout, updateSetLayout } = useTheme();
  const ink = useInk();
  const big = setLayout.buttons === 'large';
  const open = setLayout.rows === 'open';
  const size = big ? MIN_TOUCH_TARGET + spacing.sm : MIN_TOUCH_TARGET - spacing.xs;
  const step = (name: 'add' | 'remove') => (
    <View style={[styles.box, { width: big ? size : spacing.xl + spacing.xs, height: big ? size : spacing.xl + spacing.xs, backgroundColor: palette.surfaceMuted }]}>
      <Icon name={name} size={big ? 24 : 16} color={palette.text} />
    </View>
  );
  const check = (
    <View style={[styles.box, { width: size, height: size, borderColor: palette.accentStrong, borderWidth: 3 }]}>
      <Icon name="checkmark" size={20} color={palette.accentStrong} />
    </View>
  );
  const control = <K extends keyof SetLayout>(key: K, labels: Record<SetLayout[K] & string, string>) => (
    <SegmentedControl<SetLayout[K] & string>
      value={setLayout[key] as SetLayout[K] & string}
      onChange={(next) => updateSetLayout(key, next as SetLayout[K])}
      options={(SET_LAYOUT_OPTIONS[key] as (SetLayout[K] & string)[]).map((value) => ({ value, label: labels[value] }))}
    />
  );
  return (
    <>
      <Card>
        <Tag>{t('profile.setsPreview')}</Tag>
        <View style={[styles.row, { borderColor: ink, backgroundColor: palette.accentSoft }]}>
          {setLayout.check === 'left' ? check : null}
          <Tag>1</Tag>
          <View style={styles.figures}>
            {open ? step('remove') : null}
            <Numeral style={styles.value}>8</Numeral>
            {open ? step('add') : null}
          </View>
          {setLayout.check === 'right' ? check : null}
        </View>
      </Card>
      <Card>
        <Label>{t('profile.setsRows')}</Label>
        {control('rows', { table: t('profile.setsRowsTable'), open: t('profile.setsRowsOpen') })}
        <Label>{t('profile.setsButtons')}</Label>
        {control('buttons', { standard: t('profile.setsButtonsStandard'), large: t('profile.setsButtonsLarge') })}
        <Label>{t('profile.setsCheck')}</Label>
        {control('check', { right: t('profile.setsCheckRight'), left: t('profile.setsCheckLeft') })}
        <Body>{t('profile.setsHint')}</Body>
      </Card>
    </>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: instrument.line, borderRadius: radii.control },
  figures: { flex: 1, flexBasis: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  value: { fontSize: 24, lineHeight: 30 },
  box: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.control },
});
