import type { TFunction } from 'i18next';
import { formatClock, formatDuration, formatNumber } from '../../shared/utils/format';
import type { RecordKind } from './records';

export function formatRecordValue(kind: RecordKind | 'volume', value: number, metric: string, t: TFunction): string {
  switch (kind) {
    case 'loadAtReps':
    case 'e1rm':
      return `${formatNumber(Math.round(value * 10) / 10)} kg`;
    case 'repsAtLoad':
      return t('records.reps', { count: value });
    case 'holdAtLoad':
      return formatDuration(value);
    case 'shorterRest':
      return formatClock(value);
    case 'volume':
      return metric === 'reps_load' ? `${formatNumber(Math.round(value))} kg·rep`
        : metric === 'time_load' ? `${formatNumber(Math.round(value))} kg·s`
          : metric === 'time' || metric === 'time_load' ? formatDuration(value) : t('records.reps', { count: value });
  }
}
