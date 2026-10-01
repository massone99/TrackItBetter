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
import { ActionButton, Body, Card, Chip, Heading, Label, PageHeading, Screen, SectionTitle, SegmentedControl, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

type TrackerMode = 'measurements' | 'mobility';
type Language = 'en' | 'it';

const copy = {
  en: {
    measurementTitle: 'Body measurements', measurementSubtitle: 'Track circumference over time. Measure at the same point and under similar conditions.',
    mobilityTitle: 'Mobility tests', mobilitySubtitle: 'Repeat these simple checks with the same setup to compare your range over time.',
    chooseMeasurement: 'Measurement', chooseTest: 'Standardized test', value: 'Value', save: 'Save entry', history: 'Timeline',
    empty: 'No entries yet. Add your first measurement above.', validation: 'Enter a valid value for this entry.',
    cm: 'cm', inch: 'in', degree: '°', left: 'Left', right: 'Right', both: 'Both sides',
    waist: 'Waist', hips: 'Hips', chest: 'Chest', upper_arm: 'Upper arm', thigh: 'Thigh', calf: 'Calf',
    pike: 'Pike fold', pancake: 'Pancake fold', bridge: 'Bridge shoulder angle', shoulder_flexion: 'Shoulder flexion', splits: 'Front split',
    pikeHelp: 'Measure the gap from your fingertips to the floor while folding forward. 0 means your fingertips touch the floor.',
    pancakeHelp: 'Measure sternum to floor in a seated straddle fold. Use 0 when the sternum touches the floor.',
    bridgeHelp: 'Record shoulder flexion angle in your bridge position using the same angle app or assessor each time.',
    shoulder_flexionHelp: 'Stand tall and raise one straight arm overhead without arching your back. Record the arm angle from your side.',
    splitsHelp: 'Measure the vertical gap from pelvis to floor in a front split. 0 means the pelvis reaches the floor; record each side separately.',
    trend: 'Recent trend',
  },
  it: {
    measurementTitle: 'Misure corporee', measurementSubtitle: 'Monitora le circonferenze. Misura sempre nello stesso punto e in condizioni simili.',
    mobilityTitle: 'Test di mobilità', mobilitySubtitle: 'Ripeti questi controlli con la stessa posizione per confrontare i progressi nel tempo.',
    chooseMeasurement: 'Misura', chooseTest: 'Test standardizzato', value: 'Valore', save: 'Salva misura', history: 'Cronologia',
    empty: 'Ancora nessuna registrazione. Aggiungi la prima misura qui sopra.', validation: 'Inserisci un valore valido per questa registrazione.',
    cm: 'cm', inch: 'pollici', degree: '°', left: 'Sinistra', right: 'Destra', both: 'Entrambi i lati',
    waist: 'Vita', hips: 'Fianchi', chest: 'Torace', upper_arm: 'Braccio', thigh: 'Coscia', calf: 'Polpaccio',
    pike: 'Piegamento pike', pancake: 'Piegamento pancake', bridge: 'Angolo spalle nel ponte', shoulder_flexion: 'Flessione spalle', splits: 'Spaccata frontale',
    pikeHelp: 'Misura la distanza tra le dita e il pavimento durante il piegamento. 0 significa che le dita toccano terra.',
    pancakeHelp: 'Misura la distanza dello sterno dal pavimento in spaccata laterale da seduti. Usa 0 quando lo sterno tocca terra.',
    bridgeHelp: 'Registra l’angolo di flessione delle spalle nel ponte usando ogni volta la stessa app o lo stesso valutatore.',
    shoulder_flexionHelp: 'In piedi, solleva un braccio disteso sopra la testa senza inarcare la schiena. Registra l’angolo del braccio rispetto al fianco.',
    splitsHelp: 'Misura la distanza verticale tra bacino e pavimento nella spaccata frontale. 0 significa che il bacino tocca terra; registra separatamente i due lati.',
    trend: 'Andamento recente',
  },
} as const;

const sides: MeasurementSide[] = ['left', 'right', 'both'];

export function MeasurementTracker({ mode }: { mode: TrackerMode }) {
  const styles = useScaledStyles(baseStyles);
  const { i18n } = useTranslation();
  const lang: Language = (i18n.resolvedLanguage ?? i18n.language).startsWith('it') ? 'it' : 'en';
  const text = copy[lang];
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

  const save = async () => {
    const parsed = Number(value.trim().replace(',', '.'));
    try {
      if (mode === 'measurements') await recordNamedMeasurement(measurement, parsed, unit);
      else await recordMobilityTest(test, parsed, selectedMobility.sideAware ? side : 'both');
      setValue(''); setError(false); await refresh();
    } catch {
      setError(true);
    }
  };

  const titleForKind = useCallback((kind: string) => {
    const parts = kind.split(':');
    const key = parts[1] as keyof typeof text;
    const label = text[key] ?? kind;
    if (parts[0] === 'mobility' && parts[2] && parts[2] !== 'both') return `${label} · ${text[parts[2] as 'left' | 'right']}`;
    return label;
  }, [text]);

  const entriesByKind = useMemo(() => {
    const groups = new Map<string, MeasurementRow[]>();
    rows.forEach((row) => groups.set(row.kind, [...(groups.get(row.kind) ?? []), row]));
    return [...groups.entries()].sort((a, b) => (b[1][0]?.measuredAt.getTime() ?? 0) - (a[1][0]?.measuredAt.getTime() ?? 0));
  }, [rows]);

  return (
    <Screen>
      <PageHeading title={mode === 'measurements' ? text.measurementTitle : text.mobilityTitle} subtitle={mode === 'measurements' ? text.measurementSubtitle : text.mobilitySubtitle} />
      <Card>
        <Label>{mode === 'measurements' ? text.chooseMeasurement : text.chooseTest}</Label>
        <View style={styles.options}>
          {(mode === 'measurements' ? namedMeasurementOptions : mobilityTestOptions).map(({ id }) => {
            const selected = mode === 'measurements' ? measurement === id : test === id;
            return <Chip key={id} label={text[id as keyof typeof text]} selected={selected} onPress={() => mode === 'measurements' ? setMeasurement(id as NamedMeasurementId) : setTest(id as MobilityTestId)} />;
          })}
        </View>
        {mode === 'measurements' ? (
          <SegmentedControl value={unit} onChange={setUnit} options={[{ value: 'cm', label: text.cm }, { value: 'in', label: text.inch }]} />
        ) : (
          <>
            <Body>{text[`${test}Help` as keyof typeof text]}</Body>
            {selectedMobility.sideAware ? <SegmentedControl value={side} onChange={setSide} options={sides.map((item) => ({ value: item, label: text[item] }))} /> : null}
          </>
        )}
        <TextField
          label={`${text.value} · ${mode === 'measurements' ? (unit === 'cm' ? text.cm : text.inch) : selectedMobility.unit === 'deg' ? text.degree : text.cm}`}
          value={value}
          onChangeText={setValue}
          keyboardType="numbers-and-punctuation"
          placeholder={mode === 'mobility' && (test === 'pike' || test === 'splits') ? '0' : '0.0'}
          error={error ? text.validation : null}
        />
        <ActionButton label={text.save} onPress={() => void save()} />
      </Card>
      <SectionTitle title={text.history} />
      {rows.length === 0 ? <Body>{text.empty}</Body> : entriesByKind.map(([kind, entries]) => (
        <View key={kind} style={styles.historyGroup}>
          <Heading>{titleForKind(kind)}</Heading>
          <TrendChart entries={entries.slice(0, 8)} label={text.trend} palette={palette} />
          {entries.slice(0, 5).map((entry) => (
            <View key={entry.id} style={[styles.historyRow, { borderBottomColor: palette.border }]}>
              <Text style={{ color: palette.text, fontWeight: '700' }}>{entry.value} {entry.unit === 'deg' ? text.degree : entry.unit === 'in' ? text.inch : text.cm}</Text>
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
  chartDate: { fontSize: 11 },
});
