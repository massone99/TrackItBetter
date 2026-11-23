import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  DEFAULT_EXERCISE_RULE,
  isCustomRule,
  PROGRESSION_FAMILIES,
  PROGRESSION_METHOD_BY_ID,
  PROGRESSION_METHODS,
  RULE_DEFAULTS,
  type ExerciseProgressionRule,
  type ProgressionFamily,
  type ProgressionMethodId,
} from '../../domain/progressionMethods';
import { ActionButton, Body, Chip, Icon, Label, Sheet, Stepper, tapFeedback, Text, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';

type Tab = 'auto' | ProgressionFamily;

function initialTab(method: ExerciseProgressionRule['method']): Tab {
  if (method === 'auto') return 'auto';
  return PROGRESSION_METHOD_BY_ID.get(method)?.family ?? 'intra';
}

function stepOptionalGate(current: number | null | undefined, next: number, min: number, max: number, start: number): number | null {
  if (current == null) return next > 0 ? start : null;
  if (next < min) return null;
  return Math.min(max, Math.round(next * 2) / 2);
}

/**
 * Configures the progression rule for a single exercise across all 21 bodyweight progression methods
 * (simple intra-exercise, simple inter-exercise, and complex periodization), plus optional form/RPE gates.
 */
export function ProgressionRuleSheet({ visible, exerciseName, metric, initialRule, onSave, onClose }: {
  visible: boolean;
  exerciseName: string;
  metric: string;
  initialRule: ExerciseProgressionRule;
  onSave: (rule: ExerciseProgressionRule) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [draft, setDraft] = useState<ExerciseProgressionRule>(() => ({ ...initialRule }));
  const [tab, setTab] = useState<Tab>(() => initialTab(initialRule.method));
  const [saving, setSaving] = useState(false);

  const timed = metric === 'time' || metric === 'time_load';
  const patch = (change: Partial<ExerciseProgressionRule>) => setDraft((current) => ({ ...current, ...change }));
  const selectMethod = (method: ProgressionMethodId | 'auto') => {
    setDraft((current) => ({ ...current, method }));
    if (method === 'auto') setTab('auto');
  };

  const activeMeta = draft.method === 'auto' ? null : PROGRESSION_METHOD_BY_ID.get(draft.method) ?? null;
  const hasParam = (key: string) => activeMeta?.params.includes(key as never) ?? false;
  const familyMethods = tab === 'auto' ? [] : PROGRESSION_METHODS.filter((item) => item.family === tab);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resetAuto = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(DEFAULT_EXERCISE_RULE);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('progRules.sheetTitle', { name: exerciseName })} body={t('progRules.sheetBody')}>
      <View style={styles.section}>
        <Label>{t('progRules.familyLabel')}</Label>
        <View style={styles.chips}>
          <Chip
            label={t('progRules.auto')}
            selected={tab === 'auto'}
            onPress={() => { setTab('auto'); patch({ method: 'auto' }); }}
          />
          {PROGRESSION_FAMILIES.map((family) => (
            <Chip
              key={family}
              label={t(`progRules.families.${family}`)}
              selected={tab === family}
              onPress={() => {
                setTab(family);
                if (draft.method === 'auto' || PROGRESSION_METHOD_BY_ID.get(draft.method)?.family !== family) {
                  const first = PROGRESSION_METHODS.find((item) => item.family === family);
                  if (first) patch({ method: first.id });
                }
              }}
            />
          ))}
        </View>
      </View>

      {tab === 'auto' ? (
        <Body>{t('progRules.autoHint')}</Body>
      ) : (
        <View style={styles.methodList}>
          {familyMethods.map((item) => {
            const selected = draft.method === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => { tapFeedback(); selectMethod(item.id); }}
                style={({ pressed }) => [
                  styles.methodRow,
                  {
                    borderColor: selected ? palette.accentStrong : palette.border,
                    backgroundColor: selected ? palette.accentSoft : pressed ? palette.surfaceMuted : palette.surface,
                  },
                ]}
              >
                <View style={styles.methodCopy}>
                  <Text style={[styles.methodName, { color: selected ? palette.accentStrong : palette.text }]}>
                    {t(`progRules.methods.${item.id}.name`)}
                  </Text>
                  <Text style={[styles.methodDesc, { color: palette.textMuted }]}>
                    {t(`progRules.methods.${item.id}.desc`)}
                  </Text>
                </View>
                {selected ? <Icon name="checkmark-circle" size={20} color={palette.accentStrong} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {activeMeta && activeMeta.params.length > 0 ? (
        <View style={styles.section}>
          <Label>{t('progRules.paramsLabel')}</Label>
          {hasParam('loadStepKg') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.loadStepKg')}
              value={draft.loadStepKg ?? RULE_DEFAULTS.loadStepKg}
              display={`+${formatNumber(draft.loadStepKg ?? RULE_DEFAULTS.loadStepKg)} kg`}
              step={0.5}
              min={0.5}
              max={25}
              editable
              onChange={(value) => patch({ loadStepKg: Math.max(0.25, Math.round(value * 4) / 4) })}
            />
          ) : null}
          {!timed && hasParam('repStep') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.repStep')}
              value={draft.repStep ?? RULE_DEFAULTS.repStep}
              min={1}
              max={10}
              editable
              onChange={(value) => patch({ repStep: Math.max(1, Math.round(value)) })}
            />
          ) : null}
          {timed && hasParam('secStep') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.secStep')}
              value={draft.secStep ?? RULE_DEFAULTS.secStep}
              display={`${draft.secStep ?? RULE_DEFAULTS.secStep} s`}
              min={1}
              max={30}
              editable
              onChange={(value) => patch({ secStep: Math.max(1, Math.round(value)) })}
            />
          ) : null}
          {hasParam('lastSetMargin') ? (
            <Stepper
              layout="row"
              label={t(timed ? 'progRules.params.lastSetMarginSec' : 'progRules.params.lastSetMarginReps')}
              value={draft.lastSetMargin ?? (timed ? RULE_DEFAULTS.lastSetMargin * 2 : RULE_DEFAULTS.lastSetMargin)}
              min={1}
              max={10}
              editable
              onChange={(value) => patch({ lastSetMargin: Math.max(1, Math.round(value)) })}
            />
          ) : null}
          {hasParam('maxSets') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.maxSets')}
              value={draft.maxSets ?? RULE_DEFAULTS.maxSets}
              min={2}
              max={15}
              editable
              onChange={(value) => patch({ maxSets: Math.max(2, Math.round(value)) })}
            />
          ) : null}
          {hasParam('restStepSec') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.restStepSec')}
              value={draft.restStepSec ?? RULE_DEFAULTS.restStepSec}
              display={`−${draft.restStepSec ?? RULE_DEFAULTS.restStepSec} s`}
              step={5}
              min={5}
              max={60}
              editable
              onChange={(value) => patch({ restStepSec: Math.max(5, Math.round(value / 5) * 5) })}
            />
          ) : null}
          {hasParam('minRestSec') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.minRestSec')}
              value={draft.minRestSec ?? RULE_DEFAULTS.minRestSec}
              display={`${draft.minRestSec ?? RULE_DEFAULTS.minRestSec} s`}
              step={5}
              min={15}
              max={300}
              editable
              onChange={(value) => patch({ minRestSec: Math.max(15, Math.round(value / 5) * 5) })}
            />
          ) : null}
          {hasParam('restPauseSec') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.restPauseSec')}
              value={draft.restPauseSec ?? RULE_DEFAULTS.restPauseSec}
              display={`${draft.restPauseSec ?? RULE_DEFAULTS.restPauseSec} s`}
              step={5}
              min={5}
              max={45}
              editable
              onChange={(value) => patch({ restPauseSec: Math.max(5, Math.round(value / 5) * 5) })}
            />
          ) : null}
          {hasParam('eccentricSec') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.eccentricSec')}
              value={draft.eccentricSec ?? RULE_DEFAULTS.eccentricSec}
              display={`${draft.eccentricSec ?? RULE_DEFAULTS.eccentricSec} s`}
              min={3}
              max={20}
              editable
              onChange={(value) => patch({ eccentricSec: Math.max(3, Math.round(value)) })}
            />
          ) : null}
          {hasParam('hybridReps') ? (
            <Stepper
              layout="row"
              label={t('progRules.params.hybridReps')}
              value={draft.hybridReps ?? RULE_DEFAULTS.hybridReps}
              min={1}
              max={5}
              editable
              onChange={(value) => patch({ hybridReps: Math.max(1, Math.round(value)) })}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Label>{t('progRules.gatesLabel')}</Label>
        <Stepper
          layout="row"
          label={t('chains.minForm')}
          value={draft.minForm ?? 0}
          display={draft.minForm != null ? `${formatNumber(draft.minForm)} / 5` : t('chains.gateOff')}
          step={0.5}
          min={0}
          max={5}
          onChange={(next) => patch({ minForm: stepOptionalGate(draft.minForm, next, 3, 5, 4) })}
        />
        <Stepper
          layout="row"
          label={t('chains.maxRpe')}
          value={draft.maxRpe ?? 0}
          display={draft.maxRpe != null ? formatNumber(draft.maxRpe) : t('chains.gateOff')}
          step={0.5}
          min={0}
          max={10}
          onChange={(next) => patch({ maxRpe: stepOptionalGate(draft.maxRpe, next, 6, 10, 8.5) })}
        />
        <TextField
          label={t('progRules.noteLabel')}
          value={draft.note ?? ''}
          onChangeText={(text) => patch({ note: text })}
          placeholder={t('progRules.notePlaceholder')}
          maxLength={200}
        />
      </View>

      <ActionButton icon="checkmark" label={t('common.save')} disabled={saving} onPress={() => void submit()} />
      {isCustomRule(initialRule) ? (
        <ActionButton icon="refresh-outline" label={t('progRules.resetAuto')} variant="ghost" disabled={saving} onPress={() => void resetAuto()} />
      ) : null}
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodList: { gap: spacing.sm },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  methodCopy: { flex: 1, minWidth: 0, gap: 2 },
  methodName: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  methodDesc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
