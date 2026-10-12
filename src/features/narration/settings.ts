import { readPreference, writePreference } from '../../shared/settings/preferences';

export const NARRATION_PREP_KEY = 'narration.prepSec';
export const DEFAULT_NARRATION_PREP_SEC = 5;
export const MAX_NARRATION_PREP_SEC = 30;

/** Seconds of preparation before every set and exercise of a narrated workout. */
export function readNarrationPrepSec(): number {
  const raw = readPreference(NARRATION_PREP_KEY);
  const value = raw === null ? NaN : Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= MAX_NARRATION_PREP_SEC ? value : DEFAULT_NARRATION_PREP_SEC;
}

export function writeNarrationPrepSec(seconds: number): void {
  writePreference(NARRATION_PREP_KEY, String(Math.min(MAX_NARRATION_PREP_SEC, Math.max(0, Math.round(seconds)))));
}
