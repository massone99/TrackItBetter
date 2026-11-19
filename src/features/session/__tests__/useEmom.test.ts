import { act, renderHook } from '@testing-library/react-native';
import type { EmomPlan } from '../../../domain/emom';
import { useEmom } from '../useEmom';

const mockStore = new Map<string, string>();
jest.mock('../../../shared/settings/preferences', () => ({
  readPreference: (key: string) => mockStore.get(key) ?? null,
  writePreference: (key: string, value: string) => { mockStore.set(key, value); },
}));
jest.mock('../../../shared/audio/beeps', () => ({ playBeep: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => undefined), deactivateKeepAwake: jest.fn(async () => undefined) }));
jest.mock('../restNotifications', () => ({ scheduleEmomNotifications: jest.fn(async () => undefined), cancelEmomNotifications: jest.fn(async () => undefined) }));
const mockRecorded: { value: number; at: number }[] = [];
jest.mock('../repository', () => ({
  countEmomRounds: jest.fn(async (_entryId: string, since: Date) => mockRecorded.filter((round) => round.at >= since.getTime()).length),
  recordEmomRound: jest.fn(async (_entryId: string, _field: string, value: number, at: Date) => { mockRecorded.push({ value, at: at.getTime() }); }),
}));

const alerts = { round: () => ({ title: '', body: '' }), done: { title: '', body: '' } };
const plan = (overrides: Partial<EmomPlan>): EmomPlan => ({ workoutId: 'w', entryId: 'e', startedAt: 0, countdownSec: 5, intervalSec: 60, rounds: 4, target: 5, value: 5, field: 'reps', ...overrides });

beforeEach(() => { mockStore.clear(); mockRecorded.length = 0; jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

describe('useEmom', () => {
  it('after the app was closed, records the missed rounds once, each at its own end time', async () => {
    const now = 200_000;
    jest.setSystemTime(now);
    // 3 reps were set before the app was closed; rounds 1 to 3 ended while it was closed and all take that value.
    mockStore.set('workout.emom.w', JSON.stringify(plan({ value: 3 })));
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useEmom('w', { onRecorded, onFinished: jest.fn(), alerts }));

    await act(async () => { await result.current.sync(); });
    await act(async () => { await result.current.sync(); });

    expect(mockRecorded).toEqual([{ value: 3, at: 65_000 }, { value: 3, at: 125_000 }, { value: 3, at: 185_000 }]);
    expect(result.current.plan?.value).toBe(3);
    expect(onRecorded).toHaveBeenCalled();
  });

  it('finishes after the last round, clearing the stored plan', async () => {
    jest.setSystemTime(10_000_000);
    mockStore.set('workout.emom.w', JSON.stringify(plan({})));
    const onFinished = jest.fn();
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished, alerts }));

    await act(async () => { await result.current.sync(); });

    expect(mockRecorded).toHaveLength(4);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(result.current.plan).toBeNull();
    expect(mockStore.get('workout.emom.w')).toBe('');
  });

  it('stop keeps finished rounds and drops the one in progress', async () => {
    jest.setSystemTime(0);
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished: jest.fn(), alerts }));
    act(() => { result.current.start({ entryId: 'e', field: 'reps', rounds: 10, intervalSec: 60, target: 6 }); });
    act(() => { result.current.setValue(4); });
    jest.setSystemTime(95_000);

    await act(async () => { await result.current.stop(); });

    expect(mockRecorded).toEqual([{ value: 4, at: 65_000 }]);
    expect(result.current.plan).toBeNull();
  });

  it('prefills each round with what the last one recorded, until it is changed by hand', async () => {
    jest.setSystemTime(0);
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished: jest.fn(), alerts }));
    act(() => { result.current.start({ entryId: 'e', field: 'reps', rounds: 10, intervalSec: 60, target: 6 }); });
    act(() => { result.current.setValue(4); });
    jest.setSystemTime(65_000);
    await act(async () => { await result.current.sync(); });
    expect(result.current.plan?.value).toBe(4);
    jest.setSystemTime(125_000);
    await act(async () => { await result.current.sync(); });
    act(() => { result.current.setValue(3); });
    jest.setSystemTime(185_000);
    await act(async () => { await result.current.sync(); });

    expect(mockRecorded.map((round) => round.value)).toEqual([4, 4, 3]);
    expect(result.current.plan?.value).toBe(3);
  });

  it('a round added while running extends the EMOM past its original end and reschedules the alerts', async () => {
    jest.setSystemTime(0);
    const { scheduleEmomNotifications } = jest.requireMock('../restNotifications');
    const onFinished = jest.fn();
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished, alerts }));
    act(() => { result.current.start({ entryId: 'e', field: 'reps', rounds: 2, intervalSec: 60, target: 5 }); });
    jest.setSystemTime(100_000);

    let added = false;
    act(() => { added = result.current.addRound(); });
    expect(added).toBe(true);
    expect(result.current.plan?.rounds).toBe(3);
    const lastCall = scheduleEmomNotifications.mock.calls.at(-1)[0];
    expect(lastCall).toHaveLength(3);

    jest.setSystemTime(10_000_000);
    await act(async () => { await result.current.sync(); });
    expect(mockRecorded).toHaveLength(3);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('does not add a round once the last one is over', async () => {
    jest.setSystemTime(10_000_000);
    mockStore.set('workout.emom.w', JSON.stringify(plan({})));
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished: jest.fn(), alerts }));
    let added = true;
    act(() => { added = result.current.addRound(); });
    expect(added).toBe(false);
    expect(result.current.plan?.rounds).toBe(4);
  });

  it('undoes an added round while it has not started, never the round running', () => {
    jest.setSystemTime(0);
    const { result } = renderHook(() => useEmom('w', { onRecorded: jest.fn(), onFinished: jest.fn(), alerts }));
    act(() => { result.current.start({ entryId: 'e', field: 'reps', rounds: 2, intervalSec: 60, target: 5 }); });
    jest.setSystemTime(30_000); // round 1 of 2 running
    act(() => { result.current.addRound(); });
    expect(result.current.plan?.rounds).toBe(3);

    let removed = false;
    act(() => { removed = result.current.removeRound(); });
    expect(removed).toBe(true);
    expect(result.current.plan?.rounds).toBe(2);

    jest.setSystemTime(100_000); // round 2 of 2 running: it is the last one and cannot go
    act(() => { removed = result.current.removeRound(); });
    expect(removed).toBe(false);
    expect(result.current.plan?.rounds).toBe(2);
  });
});
