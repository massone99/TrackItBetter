import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  applyUndulatingSlot,
  DEFAULT_PROGRESSION,
  OG2_MESOCYCLE_PRESETS,
  PROGRESSION_MODES,
  sessionsInGroup,
  type MesocyclePreset,
  type ProgressionMode,
  type ProgressionRule,
  type ProgramGroup,
} from '../../../domain/programStructure';
import { isLoadMetric, isTimedMetric, type UserProgramExercise, type UserProgramSession } from '../../../domain/userProgram';
import { ActionButton, Body, Chip, Label, SegmentedControl, Sheet, Stepper, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { spacing } from '../../../shared/theme/tokens';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { previewProgression, type BuilderExercise } from './helpers';

const MAX_WEEKS = 12;

function describe(exercise: UserProgramExercise, metric: string): string {
  const unit = isTimedMetric(metric) ? ' s' : '';
  const base = exercise.target === null ? `${exercise.sets}` : `${exercise.sets}×${exercise.target}${unit}`;
  return isLoadMetric(metric) && exercise.loadKg != null ? `${base} · ${exercise.loadKg} kg` : base;
}

function matchesPreset(weeks: number, rule: ProgressionRule, preset: MesocyclePreset): boolean {
  return weeks === preset.weeks
    && rule.targetStep === preset.rule.targetStep
    && rule.loadStep === preset.rule.loadStep
    && rule.targetCap === preset.rule.targetCap
    && rule.resetTo === preset.rule.resetTo
    && rule.deloadWeek === preset.rule.deloadWeek
    && Math.abs(rule.deloadSetCut - preset.rule.deloadSetCut) < 1e-6
    && (rule.setStep ?? 0) === (preset.rule.setStep ?? 0)
    && (rule.setCap ?? null) === (preset.rule.setCap ?? null)
    && (rule.mode ?? 'linear') === (preset.rule.mode ?? 'linear');
}

/** Number of weeks plus the progression rule; the first exercise of the source shows what one week changes. */
export function GenerateWeeksSheet({ visible, groups, sessions, info, initialGroupId, onClose, onGenerate }: {
  visible: boolean;
  groups: ProgramGroup[];
  sessions: UserProgramSession[];
  info: ReadonlyMap<string, BuilderExercise>;
  initialGroupId: string | null;
  onClose: () => void;
  onGenerate: (groupId: string, weeks: number, rule: ProgressionRule) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [weeks, setWeeks] = useState(4);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [rule, setRule] = useState<ProgressionRule>(DEFAULT_PROGRESSION);
  const sourceId = groupId && groups.some((group) => group.id === groupId) ? groupId : initialGroupId ?? groups[groups.length - 1]?.id ?? null;
  const patch = (change: Partial<ProgressionRule>) => setRule((current) => ({ ...current, ...change }));
  const capped = rule.targetCap !== null;
  const setStep = rule.setStep ?? 0;
  const mode: ProgressionMode = rule.mode ?? 'linear';

  const first = sourceId ? sessionsInGroup({ sessions }, sourceId).flatMap((session) => session.exercises)[0] : undefined;
  const firstInfo = first ? info.get(first.exerciseId) : undefined;
  const preview = first && firstInfo ? previewProgression(first, rule) : null;
  const previewText = (() => {
    if (!preview || !firstInfo) return null;
    if (mode === 'light_heavy') {
      const heavy = describe(applyUndulatingSlot(preview.after, 0, 'light_heavy'), firstInfo.metric);
      const light = describe(applyUndulatingSlot(preview.after, 1, 'light_heavy'), firstInfo.metric);
      return t('builderPlus.previewHeavyLight', { heavy, light });
    }
    if (mode === 'dup') {
      const heavy = describe(applyUndulatingSlot(preview.after, 0, 'dup'), firstInfo.metric);
      const medium = describe(applyUndulatingSlot(preview.after, 1, 'dup'), firstInfo.metric);
      const light = describe(applyUndulatingSlot(preview.after, 2, 'dup'), firstInfo.metric);
      return t('builderPlus.previewDup', { heavy, medium, light });
    }
    const before = describe(preview.before, firstInfo.metric);
    const after = describe(preview.after, firstInfo.metric);
    return before === after ? t('builderPlus.previewSame', { value: before }) : `${before}  →  ${after}`;
  })();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('builderPlus.generateTitle')} body={t('builderPlus.generateBody')}>
      {groups.length > 1 ? (
        <View style={styles.chips}>
          <Label>{t('builderPlus.sourceGroup')}</Label>
          <View style={styles.chipRow}>
            {groups.map((group) => <Chip key={group.id} label={group.name} selected={group.id === sourceId} onPress={() => setGroupId(group.id)} />)}
          </View>
        </View>
      ) : null}
      <View style={styles.chips}>
        <Label>{t('builderPlus.presets')}</Label>
        <View style={styles.chipRow}>
          {OG2_MESOCYCLE_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={t(`builderPlus.presetNames.${preset.id}`)}
              selected={matchesPreset(weeks, rule, preset)}
              onPress={() => { setWeeks(preset.weeks); setRule({ ...preset.rule }); }}
            />
          ))}
        </View>
      </View>
      <View style={styles.chips}>
        <Label>{t('builderPlus.modeLabel')}</Label>
        <SegmentedControl<ProgressionMode>
          value={mode}
          options={PROGRESSION_MODES.map((value) => ({ value, label: t(`builderPlus.modes.${value}`) }))}
          onChange={(next) => patch({ mode: next })}
        />
        {mode === 'light_heavy' ? <Body>{t('builderPlus.modeHintLightHeavy')}</Body> : null}
        {mode === 'dup' ? <Body>{t('builderPlus.modeHintDup')}</Body> : null}
      </View>
      <Stepper layout="row" label={t('builderPlus.weeks')} value={weeks} min={1} max={MAX_WEEKS} editable onChange={(value) => setWeeks(Math.min(MAX_WEEKS, Math.max(1, Math.round(value))))} />
      <Stepper layout="row" label={t('builderPlus.targetStep')} value={rule.targetStep} min={0} max={10} editable onChange={(targetStep) => patch({ targetStep: Math.round(targetStep) })} />
      <Stepper layout="row" label={t('builderPlus.setStep')} value={setStep} min={0} max={5} editable onChange={(value) => { const next = Math.round(value); patch({ setStep: next, setCap: next > 0 ? rule.setCap ?? 5 : null }); }} />
      {setStep > 0 ? (
        <Stepper
          layout="row"
          label={t('builderPlus.setCap')}
          value={rule.setCap ?? 0}
          display={rule.setCap != null ? String(rule.setCap) : t('builderPlus.none')}
          min={0}
          max={20}
          editable
          onChange={(value) => patch({ setCap: value > 0 ? Math.max(2, Math.round(value)) : null })}
        />
      ) : null}
      <Stepper layout="row" label={t('builderPlus.loadStep')} value={rule.loadStep} step={2.5} min={0} max={20} editable onChange={(loadStep) => patch({ loadStep })} />
      <Stepper
        layout="row"
        label={t('builderPlus.cap')}
        value={rule.targetCap ?? 0}
        display={capped ? String(rule.targetCap) : t('builderPlus.none')}
        min={0}
        max={100}
        editable
        onChange={(value) => patch(value > 0 ? { targetCap: Math.round(value), resetTo: rule.resetTo ?? Math.max(1, Math.round(value) - 4) } : { targetCap: null, resetTo: null })}
      />
      {capped ? <Stepper layout="row" label={t('builderPlus.resetTo')} value={rule.resetTo ?? 1} min={1} max={100} editable onChange={(resetTo) => patch({ resetTo: Math.round(resetTo) })} /> : null}
      <Stepper
        layout="row"
        label={t('builderPlus.deloadWeek')}
        value={rule.deloadWeek ?? 0}
        display={rule.deloadWeek === null ? t('builderPlus.none') : t('builderPlus.weekName', { number: rule.deloadWeek })}
        min={0}
        max={weeks}
        editable
        onChange={(value) => patch({ deloadWeek: value > 0 ? Math.min(weeks, Math.round(value)) : null })}
      />
      {rule.deloadWeek !== null ? (
        <Stepper layout="row" label={t('builderPlus.deloadCut')} value={Math.round(rule.deloadSetCut * 100)} display={`${Math.round(rule.deloadSetCut * 100)} %`} step={5} min={0} max={80} editable onChange={(value) => patch({ deloadSetCut: Math.min(0.8, Math.max(0, value / 100)) })} />
      ) : null}
      {previewText && firstInfo ? (
        <View style={[styles.preview, { borderColor: palette.border }]}>
          <Label>{t('builderPlus.previewLabel', { name: firstInfo.name })}</Label>
          <Text style={styles.previewText}>{previewText}</Text>
        </View>
      ) : null}
      <ActionButton icon="layers-outline" label={t('builderPlus.generateAction', { count: weeks })} disabled={!sourceId} onPress={() => { if (sourceId) onGenerate(sourceId, weeks, rule); }} />
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  chips: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.xs },
  previewText: { fontFamily: fonts.mono, fontSize: 15 },
});
