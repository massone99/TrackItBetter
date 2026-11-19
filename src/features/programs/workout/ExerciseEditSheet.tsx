import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BLOCKS, blockOf, type Block } from '../../../domain/blocks';
import {
  DEFAULT_TARGET_FOR,
  fitRpePerSet,
  isLoadMetric,
  isTimedMetric,
  NOTE_MAX,
  type UserProgramExercise,
} from '../../../domain/userProgram';
import { DurationField, HoldDurationField } from '../../../shared/components/DateTimePickers';
import { ActionButton, Chip, Icon, Label, MenuGroup, SegmentedControl, Sheet, Stepper, Text, TextField } from '../../../shared/components/ui';
import { radii } from '../../../shared/theme/tokens';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { readDefaultRest } from '../../session/restDefaults';
import { RpePicker } from '../../session/RpePicker';
import { rpeTargetText } from '../describe';
import { TotalTargetField, totalDefaultFor } from '../TotalTargetField';

/** Stepper value below zero stands for "reuse last time's load". */
const LOAD_AUTO = -2.5;

/** Everything one prescription can say, in a sheet: block, sets or total, target, rest, RPE, load, note. */
export function ExerciseEditSheet({ prescription, name, metric, position, onChange, onBlock, onReplace, onRemove, onClose }: {
  /** Null keeps the sheet closed. */
  prescription: UserProgramExercise | null;
  name: string;
  metric: string;
  /** "2 of 5", already formatted. */
  position: string;
  onChange: (patch: Partial<UserProgramExercise>) => void;
  onBlock: (block: Block) => void;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const defaultRest = readDefaultRest('working');
  // The app's default rest is always one of the presets, so it starts out selected.
  const restPresets = [...new Set([30, 60, 90, 120, 180, defaultRest])].sort((a, b) => a - b);
  return (
    <Sheet visible={prescription !== null} onClose={onClose} title={name} body={prescription ? `${t(`metric.${metric}`)} · ${position}` : undefined}>
      {prescription ? (
        <>
          <MenuGroup title={t('programBuilder.groupWork')}>
            <Label>{t('workout.blocks.title')}</Label>
            <SegmentedControl<Block>
              value={blockOf(prescription.block)}
              onChange={onBlock}
              options={BLOCKS.map((block) => ({ value: block, label: t(`workout.blocks.${block}`) }))}
            />
            <SegmentedControl<'sets' | 'total'>
              value={prescription.totalTarget != null ? 'total' : 'sets'}
              onChange={(mode) => onChange(mode === 'total'
                ? { totalTarget: totalDefaultFor(metric, prescription.target, prescription.sets), rpePerSet: null, rpe: prescription.rpePerSet?.find((value) => value !== null) ?? prescription.rpe ?? null }
                : { totalTarget: null })}
              options={[{ value: 'sets', label: t('programBuilder.modeSets') }, { value: 'total', label: t('programBuilder.modeTotal') }]}
            />
            {prescription.totalTarget != null ? (
              <>
                <TotalTargetField metric={metric} value={prescription.totalTarget} onChange={(totalTarget) => onChange({ totalTarget })} />
                <View style={[styles.totalHint, { backgroundColor: palette.surfaceMuted }]}>
                  <Icon name="timer-outline" size={18} color={palette.accentStrong} />
                  <View style={styles.flex}>
                    <Text style={styles.strong}>{t('programBuilder.freeRestTitle')}</Text>
                    <Label>{t('programBuilder.freeRestBody')}</Label>
                  </View>
                </View>
              </>
            ) : (
              <Stepper layout="row" label={t('programBuilder.sets')} value={prescription.sets} step={1} min={1} max={20} editable onChange={(sets) => onChange({ sets: Math.max(1, Math.round(sets)), ...(prescription.rpePerSet ? { rpePerSet: fitRpePerSet(prescription.rpePerSet, Math.max(1, Math.round(sets))) } : {}) })} />
            )}
            {prescription.totalTarget != null ? <Label>{t('programBuilder.perSetHint')}</Label> : null}
            <TargetStepper metric={metric} value={prescription.target} onChange={(target) => onChange({ target })} />
          </MenuGroup>
          <MenuGroup title={t('userProgram.rest')}>
            <DurationField
              label={t('userProgram.rest')}
              value={prescription.restSeconds ?? defaultRest}
              max={600}
              step={5}
              presets={restPresets}
              format={(seconds) => t('userProgram.secondsValue', { value: seconds })}
              onChange={(restSeconds) => onChange({ restSeconds })}
            />
          </MenuGroup>
          <MenuGroup title={t('programBuilder.rpeTarget')}>
            {prescription.totalTarget != null ? null : (
              <SegmentedControl<'same' | 'perSet'>
                value={prescription.rpePerSet ? 'perSet' : 'same'}
                onChange={(mode) => onChange(mode === 'perSet'
                  ? { rpePerSet: fitRpePerSet([prescription.rpe ?? null], prescription.sets), rpe: null }
                  : { rpe: prescription.rpePerSet?.find((value) => value !== null) ?? null, rpePerSet: null })}
                options={[{ value: 'same', label: t('programBuilder.rpeSame') }, { value: 'perSet', label: t('programBuilder.rpePerSet') }]}
              />
            )}
            {prescription.rpePerSet ? prescription.rpePerSet.map((value, index) => (
              <RpePicker
                key={index}
                compact
                label={String(index + 1)}
                sideLabel={t('programBuilder.rpeSet', { number: index + 1 })}
                value={value}
                onChange={(next) => onChange({ rpePerSet: prescription.rpePerSet!.map((item, position) => (position === index ? next : item)) })}
              />
            )) : (
              <RpePicker compact grid value={prescription.rpe ?? null} onChange={(rpe) => onChange({ rpe })} />
            )}
            {!rpeTargetText(prescription) ? <Label>{t('programBuilder.rpeNone')}</Label> : null}
          </MenuGroup>
          {isLoadMetric(metric) ? (
            <MenuGroup title={t('userProgram.load')}>
              <Stepper
                layout="column"
                label={t('userProgram.load')}
                value={prescription.loadKg ?? LOAD_AUTO}
                display={prescription.loadKg === null || prescription.loadKg === undefined ? t('userProgram.loadAuto') : t('userProgram.kgValue', { value: prescription.loadKg })}
                step={2.5}
                min={LOAD_AUTO}
                max={300}
                editable
                onChange={(value) => onChange({ loadKg: value < 0 ? null : value })}
              />
            </MenuGroup>
          ) : null}
          <MenuGroup title={t('userProgram.noteLabel')}>
            <TextField
              label={t('userProgram.noteLabel')}
              value={prescription.note ?? ''}
              onChangeText={(note) => onChange({ note })}
              placeholder={t('userProgram.notePlaceholder')}
              multiline
              maxLength={NOTE_MAX}
            />
          </MenuGroup>
          <View style={styles.buttons}>
            <ActionButton icon="swap-horizontal" label={t('userProgram.replaceExercise', { name })} secondary onPress={onReplace} />
            <ActionButton icon="trash-outline" label={t('userProgram.removeExercise', { name })} variant="danger" onPress={onRemove} />
          </View>
          <ActionButton label={t('programBuilder.exerciseDone')} onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}

/** The reps (or hold, or distance) of an exercise; optional, so a workout can be drafted without them. */
function TargetStepper({ metric, value, onChange }: { metric: string; value: number | null; onChange: (value: number | null) => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const label = isTimedMetric(metric) ? t('programBuilder.seconds') : metric === 'distance' ? t('programBuilder.meters') : t('programBuilder.reps');
  if (value === null) {
    return (
      <View style={targetStyles.open}>
        <Text style={[targetStyles.label, { color: palette.text }]}>{label}</Text>
        <Text style={[targetStyles.hint, { color: palette.textMuted }]}>{t('userProgram.targetOpen')}</Text>
        <Chip label={t('userProgram.targetSet')} icon="add" onPress={() => onChange(DEFAULT_TARGET_FOR(metric))} />
      </View>
    );
  }
  const control = isTimedMetric(metric)
    ? <HoldDurationField label={t('logger.holdCol')} value={value} min={1} max={600} onChange={onChange} />
    : metric === 'distance'
      ? <Stepper layout="row" label={label} value={value} display={t('userProgram.metersValue', { value })} step={10} min={10} max={5000} editable onChange={onChange} />
      : <Stepper layout="row" label={label} value={value} step={1} min={1} max={100} editable onChange={onChange} />;
  return (
    <View>
      {control}
      <View style={targetStyles.clear}><Chip label={t('userProgram.targetClear')} icon="close" onPress={() => onChange(null)} /></View>
    </View>
  );
}

const targetStyles = StyleSheet.create({
  open: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 48 },
  label: { fontFamily: fonts.medium, fontSize: 15 },
  hint: { flex: 1, minWidth: 120, fontFamily: fonts.body, fontSize: 14 },
  clear: { flexDirection: 'row', paddingTop: 4 },
});

const baseStyles = StyleSheet.create({
  totalHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radii.control, padding: 14 },
  buttons: { gap: 8 },
  flex: { flex: 1, gap: 4 },
  strong: { fontFamily: fonts.semibold, fontSize: 16 },
});
