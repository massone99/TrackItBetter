import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { listBodyweights, recordBodyweight } from '../src/features/body/repository';
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen, SegmentedControl } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

type WeightEntry = Awaited<ReturnType<typeof listBodyweights>>[number];

export default function BodyweightScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => setEntries(await listBodyweights()), []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const save = async () => {
    const parsed = Number(value.replace(',', '.'));
    try {
      await recordBodyweight(parsed, unit);
      setValue('');
      setError('');
      await refresh();
    } catch {
      setError(t('bodyweight.validation'));
    }
  };

  const latest = entries[0];
  return (
    <Screen>
      <PageHeading title={t('bodyweight.title')} subtitle={t('bodyweight.subtitle')} />
      {latest ? (
        <Card style={[styles.latest, { backgroundColor: palette.surfaceMuted, borderColor: palette.surfaceMuted }]}>
          <Label>{t('bodyweight.latest')}</Label>
          <View style={styles.latestValue}><Heading style={styles.number}>{latest.value}</Heading><Body>{latest.unit}</Body></View>
          <Body>{latest.measuredAt.toLocaleDateString()}</Body>
        </Card>
      ) : null}
      <Card>
        <Heading>{t('bodyweight.add')}</Heading>
        <SegmentedControl value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        <TextInput
          accessibilityLabel={t('bodyweight.value')}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder={unit === 'kg' ? '70.0' : '154.3'}
          placeholderTextColor={palette.textMuted}
          style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
        />
        {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
        <ActionButton label={t('bodyweight.save')} onPress={() => void save()} />
      </Card>
      <Label>{t('bodyweight.history')}</Label>
      {entries.length === 0 ? <Body>{t('bodyweight.empty')}</Body> : entries.map((entry) => (
        <View key={entry.id} style={[styles.historyRow, { borderBottomColor: palette.border }]}>
          <Text style={{ color: palette.text, fontWeight: '700' }}>{entry.value} {entry.unit}</Text>
          <Body>{entry.measuredAt.toLocaleDateString()}</Body>
        </View>
      ))}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  latest: { minHeight: 150, justifyContent: 'center' },
  latestValue: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  number: { fontSize: 36 },
  input: { minHeight: 54, paddingHorizontal: 15, borderWidth: 1, borderRadius: 14, fontSize: 20, fontWeight: '700' },
  historyRow: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
