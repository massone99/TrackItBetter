import type { TFunction } from 'i18next';
import { isLoadMetric, isTimedMetric, type UserProgramExercise } from '../../domain/userProgram';
import { formatNumber } from '../../shared/utils/format';

/** One-line prescription such as "3 × 8 · 20 kg · rest 90 s". */
export function describePrescription(prescription: UserProgramExercise, metric: string | undefined, t: TFunction): string {
  const target = isTimedMetric(metric)
    ? t('userProgram.secondsValue', { value: prescription.target })
    : metric === 'distance'
      ? t('userProgram.metersValue', { value: prescription.target })
      : String(prescription.target);
  const parts = [`${prescription.sets} × ${target}`];
  if (isLoadMetric(metric)) {
    parts.push(prescription.loadKg === null || prescription.loadKg === undefined
      ? t('userProgram.loadAuto')
      : t('userProgram.kgValue', { value: formatNumber(prescription.loadKg) }));
  }
  if (prescription.restSeconds > 0) parts.push(t('userProgram.restShort', { value: prescription.restSeconds }));
  return parts.join(' · ');
}
