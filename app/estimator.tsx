import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { setAssistKg, type SetBand } from '../src/domain/equipment';
import { formatRpe } from '../src/domain/rpe';
import { estimateStrength } from '../src/domain/strengthEstimates';
import { StatRow, StatTile } from '../src/features/analytics/components/StatTiles';
import { listBodyweights } from '../src/features/body/repository';
import { BandsPicker } from '../src/features/equipment/BandsPicker';
import { bandsById, useEquipment } from '../src/features/equipment/useEquipment';
import { RpePicker } from '../src/features/session/RpePicker';
import { Body, Card, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Stepper } from '../src/shared/components/ui';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatClock, formatNumber } from '../src/shared/utils/format';

type Mode = 'reps' | 'hold';
type Kind = 'body' | 'tool';

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Estimates, from a single set you give (reps or hold, effort, load, help from bands), the most reps
 * or the longest hold at that load, the one-rep max and the load for common rep counts. Independent
 * of any exercise: it shares the stat tiles, the RPE chips and the bands picker with the exercise page.
 */
export default function EstimatorScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { catalog } = useEquipment();
  const [mode, setMode] = useState<Mode>('reps');
  const [kind, setKind] = useState<Kind>('body');
  const [reps, setReps] = useState(5);
  const [seconds, setSeconds] = useState(20);
  const [rpe, setRpe] = useState<number | null>(8);
  const [added, setAdded] = useState(0);
  const [bodyweight, setBodyweight] = useState(70);
  const [sharePercent, setSharePercent] = useState(100);
  const [bands, setBands] = useState<SetBand[]>([]);
  const [manualAssist, setManualAssist] = useState(0);

  // Start from the latest bodyweight you logged.
  useEffect(() => {
    let mounted = true;
    void listBodyweights(1).then(([latest]) => {
      if (mounted && latest) setBodyweight(Math.round((latest.unit === 'lb' ? latest.value * 0.45359237 : latest.value) * 10) / 10);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const bandsAssist = catalog && bands.length > 0 ? setAssistKg(bands, bandsById(catalog)) : null;
  // Bands with known kg give the help; otherwise (none chosen, or kg unknown) the help is typed.
  const assist = bandsAssist ?? manualAssist;
  const result = estimateStrength({
    mode, amount: mode === 'reps' ? reps : seconds, rpe, addedLoadKg: added, assistKg: assist,
    bodyweightKg: kind === 'body' ? bodyweight : null, bodyShare: kind === 'body' ? sharePercent / 100 : 0,
  });
  const secondsLabel = (value: number) => formatClock(Math.round(value));
  const signedKg = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value))} kg`;

  return (
    <Screen>
      <PageHeading title={t('estimator.title')} subtitle={t('estimator.subtitle')} />

      <Card>
        <SectionTitle title={t('estimator.setTitle')} />
        <SegmentedControl<Mode> value={mode} onChange={setMode} options={[{ value: 'reps', label: t('estimator.modeReps') }, { value: 'hold', label: t('estimator.modeHold') }]} />
        {mode === 'reps'
          ? <Stepper layout="row" editable label={t('estimator.reps')} value={reps} min={1} max={60} onChange={setReps} />
          : <Stepper layout="row" editable clock label={t('estimator.seconds')} value={seconds} display={secondsLabel(seconds)} step={5} min={1} max={600} onChange={setSeconds} />}
        <RpePicker value={rpe} onChange={setRpe} />
        <Body>{rpe === null ? t('estimator.rpeNone') : t('estimator.rpeHint', { value: formatRpe(rpe) })}</Body>
      </Card>

      <Card>
        <SectionTitle title={t('estimator.loadTitle')} />
        <SegmentedControl<Kind> value={kind} onChange={setKind} options={[{ value: 'body', label: t('estimator.kindBody') }, { value: 'tool', label: t('estimator.kindTool') }]} />
        {kind === 'body' ? (
          <>
            <Stepper layout="row" editable label={t('estimator.bodyweight')} value={bodyweight} display={`${formatNumber(bodyweight)} kg`} step={0.5} min={20} max={300} onChange={setBodyweight} />
            <Stepper layout="row" editable label={t('estimator.share')} value={sharePercent} display={`${sharePercent} %`} step={5} min={5} max={100} onChange={setSharePercent} />
            <Body>{t('estimator.shareHint')}</Body>
          </>
        ) : null}
        <Stepper layout="row" editable label={t('estimator.added')} value={added} display={`${formatNumber(added)} kg`} step={2.5} min={0} max={500} onChange={setAdded} />
        <BandsPicker bands={bands} onChange={setBands} />
        {bandsAssist === null ? (
          <Stepper layout="row" editable label={bands.length > 0 ? t('estimator.assistUnknown') : t('estimator.assist')} value={manualAssist} display={`${formatNumber(manualAssist)} kg`} step={2.5} min={0} max={300} onChange={setManualAssist} />
        ) : <Body>{t('estimator.assistFromBands', { value: formatNumber(bandsAssist) })}</Body>}
      </Card>

      <View style={styles.results}>
        <SectionTitle title={t('estimator.resultTitle')} />
        {result.maxReps === null && result.maxHoldSec === null ? <Body>{t('estimator.empty')}</Body> : (
          <>
            <StatRow>
              {result.maxReps !== null ? <StatTile value={t('records.reps', { count: round1(result.maxReps) })} label={t('estimator.maxReps')} /> : null}
              {result.maxHoldSec !== null ? <StatTile value={secondsLabel(result.maxHoldSec)} label={t('estimator.maxHold')} /> : null}
              {result.oneRepMaxKg !== null ? <StatTile value={`${formatNumber(round1(result.oneRepMaxKg))} kg`} label={t('estimator.oneRm')} /> : null}
            </StatRow>
            {kind === 'body' || result.netLoadKg !== 0 ? (
              <Body>{result.netLoadKg > 0
                ? t('estimate.atLoad', { value: formatNumber(result.netLoadKg) })
                : result.netLoadKg < 0 ? t('estimate.withHelp', { value: formatNumber(-result.netLoadKg) }) : t('estimate.bodyOnly')}</Body>
            ) : null}
            {result.effectiveLoadKg !== null ? <Label>{t('estimator.effective', { value: formatNumber(result.effectiveLoadKg) })}</Label> : mode === 'reps' ? <Body>{t('estimator.noLoad')}</Body> : null}
            {result.vsBodyKg !== null ? (
              <Body>{result.vsBodyKg >= 0 ? t('oneRm.addable', { value: formatNumber(result.vsBodyKg) }) : t('oneRm.needsHelp', { value: formatNumber(-result.vsBodyKg) })}</Body>
            ) : null}
          </>
        )}
        {result.table.length > 0 ? (
          <>
            <SectionTitle title={t('estimator.tableTitle')} />
            <ListGroup>
              {result.table.map((row) => (
                <ListRow
                  key={row.reps}
                  icon="barbell-outline"
                  title={t('estimator.tableRow', { count: row.reps, load: formatNumber(row.loadKg) })}
                  subtitle={row.vsBodyKg === null ? undefined : row.vsBodyKg >= 0 ? t('estimator.tableAdded', { value: signedKg(row.vsBodyKg) }) : t('estimator.tableHelp', { value: formatNumber(-row.vsBodyKg) })}
                />
              ))}
            </ListGroup>
            <Body>{t('oneRm.body')}</Body>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  results: { gap: 12 },
});
