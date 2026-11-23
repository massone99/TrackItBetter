import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Label, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { formatMinutes } from '../../../shared/utils/format';
import type { Volume } from './helpers';

/** Working sets per category (low ones in the warning colour), optional H/V push–pull plane balance, and estimated time. */
export function VolumeSummary({ title, volume }: { title: string; volume: Volume }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  if (volume.byCategory.length === 0 && volume.seconds === 0) return null;
  const { balance } = volume;
  const hasPlanes = balance.push + balance.pull > 0;
  const planeParts = [
    t('builderPlus.balancePushPull', { push: balance.push, pull: balance.pull }),
    balance.horizontalPush + balance.horizontalPull > 0 ? t('builderPlus.balanceHorizontal', { push: balance.horizontalPush, pull: balance.horizontalPull }) : null,
    balance.verticalPush + balance.verticalPull > 0 ? t('builderPlus.balanceVertical', { push: balance.verticalPush, pull: balance.verticalPull }) : null,
  ].filter(Boolean);
  return (
    <View style={styles.box}>
      <Label>{`${title} · ${t('builderPlus.minutes', { minutes: formatMinutes(volume.seconds) })}`}</Label>
      <View style={styles.row}>
        {volume.byCategory.map(([category, sets]) => {
          const low = volume.low.includes(category);
          return (
            <Text key={category} style={[styles.item, { color: low ? palette.warning : palette.textMuted }]}>
              {`${t(`library.category.${category}`, { defaultValue: category })} ${sets}${low ? ' ▼' : ''}`}
            </Text>
          );
        })}
      </View>
      {hasPlanes ? (
        <View style={styles.row}>
          {planeParts.map((part) => (
            <Text key={part} style={[styles.item, { color: palette.textMuted }]}>{part}</Text>
          ))}
        </View>
      ) : null}
      {volume.low.length > 0 ? (
        <Text style={[styles.warn, { color: palette.warning }]}>
          {t('builderPlus.low', { list: volume.low.map((category) => t(`library.category.${category}`, { defaultValue: category })).join(', ') })}
        </Text>
      ) : null}
      {balance.notices.length > 0 ? (
        <Text style={[styles.warn, { color: palette.textMuted }]}>
          {balance.notices.map((notice) => t(`builderPlus.balanceNotices.${notice}`)).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  item: { fontFamily: fonts.mono, fontSize: 13 },
  warn: { fontFamily: fonts.medium, fontSize: 13 },
});
