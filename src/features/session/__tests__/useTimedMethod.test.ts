import { act, renderHook } from '@testing-library/react-native';
import { playBeep } from '../../../shared/audio/beeps';
import { recordTimedMethod } from '../repository';
import { DEFAULT_TIMED_CONFIG, readTimedConfig, readTimedPlan } from '../timedMethodPlan';
import { useTimedMethod } from '../useTimedMethod';

const mockStore = new Map<string, string>();
jest.mock('../../../shared/settings/preferences', () => ({
  readPreference: (key: string) => mockStore.get(key) ?? null,
  writePreference: (key: string, value: string) => { mockStore.set(key, value); },
}));
jest.mock('../../../shared/audio/beeps', () => ({ playBeep: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn(async () => {}) }));
jest.mock('../repository', () => ({ recordTimedMethod: jest.fn(async () => {}) }));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(1000);
});
afterEach(() => jest.useRealTimers());

it('freezes a partial stop and retries at the same instant on reopening', async () => {
  const callbacks = { onRecorded: jest.fn(), onSaveError: jest.fn() };
  const { result, unmount } = renderHook(() => useTimedMethod('w', callbacks));
  act(() => result.current.start({ ...DEFAULT_TIMED_CONFIG, entryId: 'entry', exerciseId: 'exercise', countdownSec: 0 }));
  await act(async () => { jest.advanceTimersByTime(3800); });
  jest.mocked(recordTimedMethod).mockRejectedValueOnce(new Error('write failed'));

  await act(async () => { expect(await result.current.stop()).toBe(false); });
  expect(callbacks.onSaveError).toHaveBeenCalledTimes(1);
  expect(readTimedPlan('w')?.stoppedAt).toBe(4800);
  unmount();
  jest.setSystemTime(100000);
  const restored = renderHook(() => useTimedMethod('w', callbacks));
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(recordTimedMethod).toHaveBeenLastCalledWith(expect.objectContaining({ entryId: 'entry' }), 4800, true);
  expect(restored.result.current.plan).toBeNull();
  expect(readTimedPlan('w')).toBeNull();
});

it('plays customized beep tones with volume and updates cues live', async () => {
  const callbacks = { onRecorded: jest.fn(), onSaveError: jest.fn() };
  const { result } = renderHook(() => useTimedMethod('w', callbacks));
  act(() => result.current.start({
    ...DEFAULT_TIMED_CONFIG,
    entryId: 'entry',
    exerciseId: 'exercise',
    countdownSec: 1,
    holdSec: 10,
    restSec: 10,
    cues: { ...DEFAULT_TIMED_CONFIG.cues, warningSec: 1, warningTone: 'sharp', holdStartTone: 'bell', restStartTone: 'double', volume: 0.5, vibrate: false },
  }));
  expect(playBeep).toHaveBeenCalledWith('sharp', { volume: 0.5, vibrate: false });

  await act(async () => { jest.advanceTimersByTime(1100); });
  expect(playBeep).toHaveBeenCalledWith('bell', { volume: 0.5, vibrate: false });

  act(() => result.current.updateCues({ ...DEFAULT_TIMED_CONFIG.cues, restStartTone: 'soft', volume: 0.75, vibrate: true }));
  expect(readTimedConfig('exercise').cues.restStartTone).toBe('soft');

  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(playBeep).toHaveBeenCalledWith('soft', { volume: 0.75, vibrate: true });
});

it('waits for confirmRound before starting rest on reps timed method', async () => {
  const callbacks = { onRecorded: jest.fn(), onSaveError: jest.fn() };
  const { result } = renderHook(() => useTimedMethod('w', callbacks));
  act(() => result.current.start({
    ...DEFAULT_TIMED_CONFIG,
    kind: 'reps',
    repsPerRound: 3,
    maxSet: false,
    entryId: 'entry',
    exerciseId: 'exercise',
    countdownSec: 0,
    blockSec: 20,
    holdSec: 10,
    restSec: 0,
    testSec: 0,
  }));
  // Even after 25s, still waiting in round 1 — rest has NOT started
  await act(async () => { jest.advanceTimersByTime(25000); });
  expect(result.current.phase).toMatchObject({ phase: 'hold', round: 1, awaitingConfirm: true });

  // User presses confirm -> rest starts immediately (10s)
  act(() => result.current.confirmRound());
  expect(result.current.phase).toEqual({ phase: 'rest', round: 1, secondsLeft: 10 });
  expect(playBeep).toHaveBeenCalledWith('double', { volume: 1, vibrate: true });

  // Rest finishes after 10s -> round 2 awaits confirmation
  await act(async () => { jest.advanceTimersByTime(10250); });
  expect(result.current.phase).toMatchObject({ phase: 'hold', round: 2, awaitingConfirm: true });

  // Confirm final round -> block completes and saves
  await act(async () => { result.current.confirmRound(); });
  expect(recordTimedMethod).toHaveBeenCalled();
  expect(result.current.plan).toBeNull();
});
