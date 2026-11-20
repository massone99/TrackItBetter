import { readPreference, writePreference } from '../../shared/settings/preferences';

export const WORK_VOICE_KEY = 'cue.work';
export const PREP_VOICE_KEY = 'cue.prep';
export const ANNOUNCEMENT_WAIT_KEY = 'narration.announcementWaitSec';
export const DEFAULT_ANNOUNCEMENT_WAIT_SEC = 8;
export const MAX_ANNOUNCEMENT_WAIT_SEC = 30;

export function readAnnouncementWaitSec(): number {
  const value = Number(readPreference(ANNOUNCEMENT_WAIT_KEY));
  return Number.isInteger(value) && value >= 1 && value <= MAX_ANNOUNCEMENT_WAIT_SEC ? value : DEFAULT_ANNOUNCEMENT_WAIT_SEC;
}

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
