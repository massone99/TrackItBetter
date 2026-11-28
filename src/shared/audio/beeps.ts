import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { tapFeedback } from '../components/ui';

export type Beep = 'tick' | 'go' | 'done';

export type SoundTone = 'soft' | 'tick' | 'sharp' | 'double' | 'go' | 'bell' | 'done';

export type BeepTone = 'none' | SoundTone;

export const BEEP_TONES: readonly BeepTone[] = ['none', 'soft', 'tick', 'sharp', 'double', 'go', 'bell', 'done'];

export interface BeepOptions {
  /** Playback volume from 0 to 1 (defaults to 1). */
  volume?: number;
  /** Whether to trigger matching haptic feedback (defaults to true). */
  vibrate?: boolean;
}

const SOURCES: Record<SoundTone, number> = {
  // Bundled assets can only be referenced through require().
  soft: require('../../../assets/sounds/soft.wav'),
  tick: require('../../../assets/sounds/tick.wav'),
  sharp: require('../../../assets/sounds/sharp.wav'),
  double: require('../../../assets/sounds/double.wav'),
  go: require('../../../assets/sounds/go.wav'),
  bell: require('../../../assets/sounds/bell.wav'),
  done: require('../../../assets/sounds/done.wav'),
};

const browserSounds = new Map<SoundTone, HTMLAudioElement>();
const players = new Map<SoundTone, AudioPlayer>();
let audioModeConfigured = false;

function loadPlayer(kind: SoundTone): AudioPlayer | null {
  const existing = players.get(kind);
  if (existing) return existing;
  try {
    if (!audioModeConfigured) {
      audioModeConfigured = true;
      // Short cues mix with the user's music and still sound with the ringer on silent (iOS).
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    }
    const created = createAudioPlayer(SOURCES[kind]);
    players.set(kind, created);
    return created;
  } catch {
    return null;
  }
}

export function isBeepTone(value: unknown): value is BeepTone {
  return typeof value === 'string' && (BEEP_TONES as readonly string[]).includes(value);
}

/**
 * Plays a short cue with optional matching vibration and volume. Sound is a convenience:
 * if it cannot play, only the vibration remains. Passing `'none'` plays no sound (optional vibration only).
 */
export function playBeep(kind: BeepTone, options?: BeepOptions): void {
  const vibrate = options?.vibrate !== false;
  if (vibrate) {
    const strong = kind === 'go' || kind === 'bell' || kind === 'done' || kind === 'double';
    tapFeedback(strong ? 'success' : 'light');
  }
  if (kind === 'none') return;
  const volume = Math.max(0, Math.min(1, options?.volume ?? 1));
  if (volume <= 0) return;
  if (Platform.OS === 'web') {
    if (typeof Audio === 'undefined') return;
    const sound = browserSounds.get(kind) ?? new Audio(Asset.fromModule(SOURCES[kind]).uri);
    browserSounds.set(kind, sound);
    sound.volume = volume;
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
    return;
  }
  const player = loadPlayer(kind);
  if (!player) return;
  try {
    player.volume = volume;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  } catch {
    // Ignore: the vibration already signalled the moment.
  }
}
