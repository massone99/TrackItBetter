import { act, renderHook } from '@testing-library/react-native';
import { recordTimedMethod } from '../repository';
import { DEFAULT_TIMED_CONFIG, readTimedPlan } from '../timedMethodPlan';
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
