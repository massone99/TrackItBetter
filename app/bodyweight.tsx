import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { listBodyweights, recordBodyweight } from '../src/features/body/repository';
import { ActionButton, Body, Card, Heading, Label, ListGroup, ListRow, Numeral, PageHeading, Screen, SectionTitle, SegmentedControl, TextField } from '../src/shared/components/ui';
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
        <Card style={[styles.latest, { backgroundColor: palette.accentSoft, borderColor: palette.accentSoft }]}>
          <Label>{t('bodyweight.latest')}</Label>
          <View style={styles.latestValue}><Numeral>{latest.value}</Numeral><Body>{latest.unit}</Body></View>
          <Body>{latest.measuredAt.toLocaleDateString()}</Body>
        </Card>
      ) : null}
      <Card>
        <Heading>{t('bodyweight.add')}</Heading>
        <SegmentedControl value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        <TextField
          label={t('bodyweight.value')}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder={unit === 'kg' ? '70.0' : '154.3'}
          error={error}
        />
        <ActionButton label={t('bodyweight.save')} onPress={() => void save()} />
      </Card>
      <SectionTitle title={t('bodyweight.history')} />
      {entries.length === 0 ? <Body>{t('bodyweight.empty')}</Body> : <ListGroup>{entries.map((entry) => (
        <ListRow key={entry.id} title={`${entry.value} ${entry.unit}`} trailing={<Body>{entry.measuredAt.toLocaleDateString()}</Body>} />
      ))}</ListGroup>}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  latest: { minHeight: 136, justifyContent: 'center', gap: 8 },
  latestValue: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
});
