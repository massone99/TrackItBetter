import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_PROGRESSION, sessionsInGroup, type ProgressionRule, type ProgramGroup } from '../../../domain/programStructure';
import { isLoadMetric, isTimedMetric, type UserProgramExercise, type UserProgramSession } from '../../../domain/userProgram';
import { ActionButton, Chip, Label, Sheet, Stepper, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { previewProgression, type BuilderExercise } from './helpers';

const MAX_WEEKS = 12;

function describe(exercise: UserProgramExercise, metric: string): string {
  const unit = isTimedMetric(metric) ? ' s' : '';
  const base = exercise.target === null ? `${exercise.sets}` : `${exercise.sets}×${exercise.target}${unit}`;
  return isLoadMetric(metric) && exercise.loadKg != null ? `${base} · ${exercise.loadKg} kg` : base;
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
  const [weeks, setWeeks] = useState(4);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [rule, setRule] = useState<ProgressionRule>(DEFAULT_PROGRESSION);
  const sourceId = groupId && groups.some((group) => group.id === groupId) ? groupId : initialGroupId ?? groups[groups.length - 1]?.id ?? null;
  const patch = (change: Partial<ProgressionRule>) => setRule((current) => ({ ...current, ...change }));
  const capped = rule.targetCap !== null;

  const first = sourceId ? sessionsInGroup({ sessions }, sourceId).flatMap((session) => session.exercises)[0] : undefined;
  const firstInfo = first ? info.get(first.exerciseId) : undefined;
  const preview = first && firstInfo ? previewProgression(first, rule) : null;
  const unchanged = preview && describe(preview.before, firstInfo!.metric) === describe(preview.after, firstInfo!.metric);

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
      <Stepper layout="row" label={t('builderPlus.weeks')} value={weeks} min={1} max={MAX_WEEKS} editable onChange={(value) => setWeeks(Math.min(MAX_WEEKS, Math.max(1, Math.round(value))))} />
      <Stepper layout="row" label={t('builderPlus.targetStep')} value={rule.targetStep} min={0} max={10} editable onChange={(targetStep) => patch({ targetStep: Math.round(targetStep) })} />
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
      {preview && firstInfo ? (
        <View style={[styles.preview, { borderColor: palette.border }]}>
          <Label>{t('builderPlus.previewLabel', { name: firstInfo.name })}</Label>
          <Text style={styles.previewText}>{unchanged ? t('builderPlus.previewSame', { value: describe(preview.before, firstInfo.metric) }) : `${describe(preview.before, firstInfo.metric)}  →  ${describe(preview.after, firstInfo.metric)}`}</Text>
        </View>
      ) : null}
      <ActionButton icon="layers-outline" label={t('builderPlus.generateAction', { count: weeks })} disabled={!sourceId} onPress={() => { if (sourceId) onGenerate(sourceId, weeks, rule); }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: { borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  previewText: { fontFamily: fonts.mono, fontSize: 15 },
});
