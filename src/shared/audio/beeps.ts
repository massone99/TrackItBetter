import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { tapFeedback } from '../components/ui';

export type Beep = 'tick' | 'go' | 'done';

const SOURCES: Record<Beep, number> = {
  // Bundled assets can only be referenced through require().
  tick: require('../../../assets/sounds/tick.wav'),
  go: require('../../../assets/sounds/go.wav'),
  done: require('../../../assets/sounds/done.wav'),
};

let players: Record<Beep, AudioPlayer> | null = null;

function load(): Record<Beep, AudioPlayer> | null {
  if (players) return players;
  try {
    // Short cues mix with the user's music and still sound with the ringer on silent (iOS).
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    players = { tick: createAudioPlayer(SOURCES.tick), go: createAudioPlayer(SOURCES.go), done: createAudioPlayer(SOURCES.done) };
  } catch {
    players = null;
  }
  return players;
}

/**
 * Plays a short cue with a matching vibration: `tick` for countdown seconds, `go` when a hold starts,
 * `done` when a timer ends. Sound is a convenience: if it cannot play, only the vibration remains.
 */
export function playBeep(kind: Beep): void {
  tapFeedback(kind === 'tick' ? 'light' : 'success');
  if (Platform.OS === 'web') return;
  const player = load()?.[kind];
  if (!player) return;
  try {
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  } catch {
    // Ignore: the vibration already signalled the moment.
  }
}
