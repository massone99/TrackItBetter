import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ActionButton, Body, Card, Chip, Heading, IconButton, Label, PageHeading, Screen, SectionTitle } from '../src/shared/components/ui';
import { Text } from '../src/shared/components/Text';
import { getTrainingTotals } from '../src/features/analytics/repository';
import { dateFromLocalKey, localDateKey, type TrainingTotals } from '../src/features/analytics/trainingTotals';
import { movementTagLabel } from '../src/features/exercises/ClassificationChoices';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatDuration } from '../src/shared/utils/format';

const copy = {
  en: {
    title: 'Training totals', subtitle: 'Daily totals and the seven days ending on your selected date.', date: 'Training date',
    daily: 'Selected day', week: 'Seven days', holds: 'Timed hold time', byTag: 'Hold time by movement tag',
    sets: 'Completed working sets', exercises: 'By movement', groups: 'By movement group', threshold: 'RPE threshold',
    allDaily: 'Day', allWeek: '7 days', thresholdDaily: 'Day at threshold', thresholdWeek: '7 days at threshold',
    previous: 'Previous day', next: 'Next day', selectDate: 'Go to date', invalidDate: 'Enter a valid date as YYYY-MM-DD.', loading: 'Loading training totals…', error: 'Training totals could not be loaded.', retry: 'Retry',
  },
  it: {
    title: 'Totali allenamento', subtitle: 'Totali giornalieri e dei sette giorni che terminano nella data selezionata.', date: 'Data allenamento',
    daily: 'Giorno selezionato', week: 'Sette giorni', holds: 'Tempo totale di tenuta', byTag: 'Tenuta per tag del movimento',
    sets: 'Serie di lavoro completate', exercises: 'Per movimento', groups: 'Per gruppo di movimenti', threshold: 'Soglia RPE',
    allDaily: 'Giorno', allWeek: '7 giorni', thresholdDaily: 'Giorno alla soglia', thresholdWeek: '7 giorni alla soglia',
    previous: 'Giorno precedente', next: 'Giorno successivo', selectDate: 'Vai alla data', invalidDate: 'Inserisci una data valida nel formato AAAA-MM-GG.', loading: 'Caricamento dei totali…', error: 'Impossibile caricare i totali.', retry: 'Riprova',
  },
} as const;

export default function TrainingTotalsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const strings = copy[locale];
  const [date, setDate] = useState(() => new Date());
  const [dateDraft, setDateDraft] = useState(() => localDateKey(new Date()));
  const [dateInvalid, setDateInvalid] = useState(false);
  const [threshold, setThreshold] = useState(8);
  const [totals, setTotals] = useState<TrainingTotals | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setTotals(null);
    setFailed(false);
    getTrainingTotals(date, threshold).then((result) => { if (active) setTotals(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [date, threshold]));

  const shiftDate = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    if (localDateKey(next) <= localDateKey(new Date())) {
      setTotals(null);
      setDate(next);
      setDateDraft(localDateKey(next));
      setDateInvalid(false);
    }
  };
  const applyDate = () => {
    const parsed = dateFromLocalKey(dateDraft);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft) || localDateKey(parsed) !== dateDraft || dateDraft > localDateKey(new Date())) {
      setDateInvalid(true);
      return;
    }
    setTotals(null);
    setDateInvalid(false);
    setDate(parsed);
  };
  const displayDate = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);

  return <Screen>
    <PageHeading title={strings.title} subtitle={strings.subtitle} />
    <Card>
      <Label>{strings.date}</Label>
      <View style={styles.dateRow}>
        <IconButton icon="chevron-back" label={strings.previous} onPress={() => shiftDate(-1)} />
        <Text accessibilityLiveRegion="polite" style={[styles.dateText, { color: palette.text }]}>{displayDate}</Text>
        <IconButton icon="chevron-forward" label={strings.next} onPress={() => shiftDate(1)} />
      </View>
      <View style={styles.dateInputRow}>
        <TextInput accessibilityLabel={strings.date} value={dateDraft} onChangeText={(value) => { setDateDraft(value); setDateInvalid(false); }} onSubmitEditing={applyDate} returnKeyType="go" placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={[styles.dateInput, { color: palette.text, borderColor: palette.border }]} />
        <ActionButton label={strings.selectDate} variant="secondary" onPress={applyDate} />
      </View>
      {dateInvalid && <Text style={[styles.validation, { color: palette.warning }]}>{strings.invalidDate}</Text>}
      <Label>{strings.threshold} · {threshold}</Label>
      <View style={styles.chips}>{[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((value) => <Chip key={value} label={String(value)} selected={threshold === value} onPress={() => setThreshold(value)} />)}</View>
    </Card>
    {!totals ? <Card style={styles.loadingCard}>{failed ? <Pressable accessibilityRole="button" onPress={() => setDate((current) => new Date(current))}><Heading>{strings.error}</Heading><Body>{strings.retry}</Body></Pressable> : <><ActivityIndicator color={palette.accentStrong} /><Body>{strings.loading}</Body></>}</Card> : <>
      <Card>
        <SectionTitle title={strings.holds} />
        <View style={styles.holdSummary}>
          <Metric label={strings.daily} value={formatDuration(totals.dailyHoldSeconds)} />
          <Metric label={strings.week} value={formatDuration(totals.weeklyHoldSeconds)} />
        </View>
        <View style={styles.holdRow}>
          <Label style={styles.name}>{strings.byTag}</Label>
          <Label style={styles.holdColumn}>{strings.allDaily}</Label>
          <Label style={styles.holdColumn}>{strings.allWeek}</Label>
        </View>
        {totals.tags.map((tag) => <View key={tag.id} style={[styles.holdRow, { borderTopColor: palette.border }]}>
          <Body style={styles.name}>{movementTagLabel(tag.id, t)}</Body>
          <Text style={[styles.holdColumn, { color: palette.text }]}>{formatDuration(tag.dailyHoldSeconds)}</Text>
          <Text style={[styles.holdColumn, { color: palette.text }]}>{formatDuration(tag.weeklyHoldSeconds)}</Text>
        </View>)}
      </Card>
      <Card>
        <SectionTitle title={strings.sets} />
        <Label>{strings.exercises}</Label>
        {totals.exercises.map((exercise) => <CountRow key={exercise.id} name={exercise.name} daily={exercise.daily} weekly={exercise.weekly} dailyAtThreshold={exercise.dailyAtThreshold} weeklyAtThreshold={exercise.weeklyAtThreshold} strings={strings} />)}
      </Card>
      <Card>
        <SectionTitle title={strings.groups} />
        {totals.groups.map((group) => <CountRow key={group.id} name={t(`movement.groups.${group.id}`)} daily={group.daily} weekly={group.weekly} dailyAtThreshold={group.dailyAtThreshold} weeklyAtThreshold={group.weeklyAtThreshold} strings={strings} />)}
      </Card>
    </>}
  </Screen>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={[styles.metric, { backgroundColor: palette.surfaceMuted }]}><Label>{label}</Label><Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>;
}

function CountRow({ name, daily, weekly, dailyAtThreshold, weeklyAtThreshold, strings }: { name: string; daily: number; weekly: number; dailyAtThreshold: number; weeklyAtThreshold: number; strings: typeof copy.en | typeof copy.it }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={[styles.countRow, { borderTopColor: palette.border }]}>
    <Text numberOfLines={2} style={[styles.name, { color: palette.text }]}>{name}</Text>
    <View style={styles.counts}>
      <View style={styles.count}><Body>{strings.allDaily}</Body><Text style={{ color: palette.text }}>{daily}</Text></View>
      <View style={styles.count}><Body>{strings.allWeek}</Body><Text style={{ color: palette.text }}>{weekly}</Text></View>
      <View style={styles.count}><Body>{strings.thresholdDaily}</Body><Text style={{ color: palette.accentStrong }}>{dailyAtThreshold}</Text></View>
      <View style={styles.count}><Body>{strings.thresholdWeek}</Body><Text style={{ color: palette.accentStrong }}>{weeklyAtThreshold}</Text></View>
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  dateText: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Barlow_600SemiBold' },
  dateInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dateInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  validation: { marginTop: -3, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  loadingCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  holdSummary: { flexDirection: 'row', gap: 12, marginVertical: 12 },
  metric: { flex: 1, padding: 12, borderRadius: 14 },
  metricValue: { fontSize: 21, fontFamily: 'Barlow_600SemiBold', marginTop: 3 },
  holdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  holdColumn: { width: 70, textAlign: 'right', fontSize: 14, fontFamily: 'Barlow_600SemiBold' },
  countRow: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 7 },
  name: { flex: 1, fontSize: 15, fontFamily: 'Barlow_600SemiBold' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { width: '22%', minWidth: 66 },
});
