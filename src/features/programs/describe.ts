import type { TFunction } from 'i18next';
import { formatRpe } from '../../domain/rpe';
import { isLoadMetric, isTimedMetric, type UserProgramExercise } from '../../domain/userProgram';
import { formatNumber } from '../../shared/utils/format';

/** "8", or "7 · 8 · 9" for per-set targets; null without any target. */
export function rpeTargetText(prescription: Pick<UserProgramExercise, 'rpe' | 'rpePerSet'>): string | null {
  if (prescription.rpePerSet?.some((value) => value !== null)) return prescription.rpePerSet.map((value) => (value === null ? '–' : formatRpe(value))).join(' · ');
  return prescription.rpe != null ? formatRpe(prescription.rpe) : null;
}

/** One-line prescription such as "3 × 8 @ RPE 8 · 20 kg · rest 90 s". */
export function describePrescription(prescription: UserProgramExercise, metric: string | undefined, t: TFunction): string {
  const target = prescription.target === null
    ? null
    : isTimedMetric(metric)
    ? t('userProgram.secondsValue', { value: prescription.target })
    : metric === 'distance'
      ? t('userProgram.metersValue', { value: prescription.target })
      : String(prescription.target);
  const rpe = rpeTargetText(prescription);
  const sets = target === null ? t('userProgram.setsOnly', { count: prescription.sets }) : `${prescription.sets} × ${target}`;
  const parts = [rpe ? `${sets} @ ${t('logger.rpeTag', { value: rpe })}` : sets];
  if (isLoadMetric(metric)) {
    parts.push(prescription.loadKg === null || prescription.loadKg === undefined
      ? t('userProgram.loadAuto')
      : t('userProgram.kgValue', { value: formatNumber(prescription.loadKg) }));
  }
  if (prescription.restSeconds != null && prescription.restSeconds > 0) parts.push(t('userProgram.restShort', { value: prescription.restSeconds }));
  return parts.join(' · ');
}
