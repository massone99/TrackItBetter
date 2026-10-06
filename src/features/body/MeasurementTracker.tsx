import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/Text';
import {
  listMobilityTests,
  listNamedMeasurements,
  MeasurementRow,
  MeasurementSide,
  MobilityTestId,
  NamedMeasurementId,
  mobilityTestOptions,
  namedMeasurementOptions,
  recordMobilityTest,
  recordNamedMeasurement,
} from './measurementsRepository';
import { useSaveOnLeave } from '../../shared/forms/useSaveOnLeave';
import { ActionButton, Body, Card, Chip, Heading, Label, PageHeading, Screen, SectionTitle, SegmentedControl, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

type TrackerMode = 'measurements' | 'mobility';


const sides: MeasurementSide[] = ['left', 'right', 'both'];

export function MeasurementTracker({ mode }: { mode: TrackerMode }) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [measurement, setMeasurement] = useState<NamedMeasurementId>('waist');
  const [test, setTest] = useState<MobilityTestId>('pike');
  const [side, setSide] = useState<MeasurementSide>('left');
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const [value, setValue] = useState('');
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [error, setError] = useState(false);

  const selectedMobility = mobilityTestOptions.find((option) => option.id === test)!;
  const refresh = useCallback(async () => {
    setRows(mode === 'measurements' ? await listNamedMeasurements() : await listMobilityTests());
  }, [mode]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const save = async (): Promise<boolean> => {
    const parsed = Number(value.trim().replace(',', '.'));
    try {
      if (mode === 'measurements') await recordNamedMeasurement(measurement, parsed, unit);
      else await recordMobilityTest(test, parsed, selectedMobility.sideAware ? side : 'both');
      setValue(''); setError(false); await refresh();
      return true;
    } catch {
      setError(true);
      return false;
    }
  };
  // A value typed but not saved is recorded on the way out; an invalid one is dropped.
  useSaveOnLeave({ dirty: value.trim() !== '', save });

  const titleForKind = (kind: string) => {
    const parts = kind.split(':');
    const label = parts[1] && i18n.exists(`bodyTracker.items.${parts[1]}`) ? t(`bodyTracker.items.${parts[1]}`) : kind;
    if (parts[0] === 'mobility' && (parts[2] === 'left' || parts[2] === 'right')) return `${label} · ${t(`bodyTracker.sides.${parts[2]}`)}`;
    return label;
  };

  const entriesByKind = useMemo(() => {
    const groups = new Map<string, MeasurementRow[]>();
    rows.forEach((row) => groups.set(row.kind, [...(groups.get(row.kind) ?? []), row]));
    return [...groups.entries()].sort((a, b) => (b[1][0]?.measuredAt.getTime() ?? 0) - (a[1][0]?.measuredAt.getTime() ?? 0));
  }, [rows]);

  return (
    <Screen>
      <PageHeading title={mode === 'measurements' ? t('bodyTracker.measurementTitle') : t('bodyTracker.mobilityTitle')} subtitle={mode === 'measurements' ? t('bodyTracker.measurementSubtitle') : t('bodyTracker.mobilitySubtitle')} />
      <Card>
        <Label>{mode === 'measurements' ? t('bodyTracker.chooseMeasurement') : t('bodyTracker.chooseTest')}</Label>
        <View style={styles.options}>
          {(mode === 'measurements' ? namedMeasurementOptions : mobilityTestOptions).map(({ id }) => {
            const selected = mode === 'measurements' ? measurement === id : test === id;
            return <Chip key={id} label={t(`bodyTracker.items.${id}`)} selected={selected} onPress={() => mode === 'measurements' ? setMeasurement(id as NamedMeasurementId) : setTest(id as MobilityTestId)} />;
          })}
        </View>
        {mode === 'measurements' ? (
          <SegmentedControl value={unit} onChange={setUnit} options={[{ value: 'cm', label: t('bodyTracker.cm') }, { value: 'in', label: t('bodyTracker.inch') }]} />
        ) : (
          <>
            <Body>{t(`bodyTracker.help.${test}`)}</Body>
            {selectedMobility.sideAware ? <SegmentedControl value={side} onChange={setSide} options={sides.map((item) => ({ value: item, label: t(`bodyTracker.sides.${item}`) }))} /> : null}
          </>
        )}
        <TextField
          label={`${t('bodyTracker.value')} · ${mode === 'measurements' ? (unit === 'cm' ? t('bodyTracker.cm') : t('bodyTracker.inch')) : selectedMobility.unit === 'deg' ? t('bodyTracker.degree') : t('bodyTracker.cm')}`}
          value={value}
          onChangeText={setValue}
          keyboardType="numbers-and-punctuation"
          maxLength={6}
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          placeholder={mode === 'mobility' && (test === 'pike' || test === 'splits') ? '0' : '0.0'}
          error={error ? t('bodyTracker.validation') : null}
        />
        <ActionButton label={t('bodyTracker.save')} onPress={() => void save()} />
      </Card>
      <SectionTitle title={t('bodyTracker.history')} />
      {rows.length === 0 ? <Body>{t('bodyTracker.empty')}</Body> : entriesByKind.map(([kind, entries]) => (
        <View key={kind} style={styles.historyGroup}>
          <Heading>{titleForKind(kind)}</Heading>
          <TrendChart entries={entries.slice(0, 8)} label={t('bodyTracker.trend')} palette={palette} />
          {entries.slice(0, 5).map((entry) => (
            <View key={entry.id} style={[styles.historyRow, { borderBottomColor: palette.border }]}>
              <Text style={{ color: palette.text, fontWeight: '700' }}>{entry.value} {entry.unit === 'deg' ? t('bodyTracker.degree') : entry.unit === 'in' ? t('bodyTracker.inch') : t('bodyTracker.cm')}</Text>
              <Body>{entry.measuredAt.toLocaleDateString()}</Body>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function TrendChart({
  entries,
  label,
  palette,
}: {
  entries: MeasurementRow[];
  label: string;
  palette: ReturnType<typeof useTheme>['palette'];
}) {
  const styles = useScaledStyles(baseStyles);
  const series = [...entries].reverse();
  if (series.length < 2) return null;
  const normalized = series.map((entry) => entry.unit === 'in' ? entry.value * 2.54 : entry.value);
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  const range = max - min || 1;
  return (
    <View accessibilityLabel={label} style={[styles.chart, { backgroundColor: palette.surfaceMuted }]}>
      <Text style={[styles.chartLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.chartBars}>
        {series.map((entry, index) => {
          const height = 10 + ((normalized[index] - min) / range) * 48;
          return (
            <View key={entry.id} style={styles.chartColumn}>
              <View style={[styles.chartBarTrack, { backgroundColor: palette.border }]}>
                <View style={[styles.chartBar, { height, backgroundColor: palette.accentStrong }]} />
              </View>
              <Text numberOfLines={1} style={[styles.chartDate, { color: palette.textMuted }]}>{entry.measuredAt.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyGroup: { gap: 8 },
  historyRow: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10 },
  chart: { borderRadius: 14, padding: 12, marginTop: 8, marginBottom: 8, gap: 10 },
  chartLabel: { fontSize: 13, fontWeight: '600' },
  chartBars: { height: 76, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 6 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  chartBarTrack: { width: '65%', height: 58, borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 5 },
  chartDate: { fontSize: 12 },
});
