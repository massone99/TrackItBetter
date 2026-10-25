import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ExerciseCard } from '../ExerciseCard';
import type { SessionExercise, SessionSet } from '../repository';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: (value: unknown) => value,
    FadeIn: { duration: () => undefined },
    ZoomIn: { duration: () => undefined },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const chain: object = new Proxy(() => chain, { get: () => () => chain });
  return { Gesture: { Pan: () => chain }, GestureDetector: ({ children }: { children: unknown }) => children };
});
jest.mock('../SwipeableSetRow', () => ({
  SwipeableSetRow: ({ children }: { children: unknown }) => children,
  DoneTint: () => null,
  PopOnActivate: ({ children }: { children: unknown }) => children,
}));
jest.mock('../../exercises/ReferenceLinkSheet', () => ({ openReferenceVideo: jest.fn() }));
jest.mock('../../exercises/openExercise', () => ({ openExercisePage: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useSegments: () => ['workout'],
}));

const set = (index: number, patch: Partial<SessionSet> = {}) => ({
  id: `s${index}`, index, kind: 'working', reps: 8, durationSec: null, distanceM: null, addedLoadKg: 60, rpe: null, rir: null,
  side: 'both', pairId: null, tempo: null, restSec: null, targetRpe: null, formRating: null, romRating: null, note: null,
  bands: [], assistKg: null, completedAt: null, clipCount: 0, poseCount: 0, ...patch,
}) as unknown as SessionSet;

const exercise = (sets: SessionSet[]) => ({
  entryId: 'e1', exerciseId: 'bench', name: 'Bench', metric: 'reps_load', sets, notes: null, groupId: null, block: null, mobility: false,
}) as unknown as SessionExercise;

function show(sets: SessionSet[], props: Partial<Parameters<typeof ExerciseCard>[0]> = {}) {
  const onComplete = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ExerciseCard
          exercise={exercise(sets)}
          collapsed={false}
          onToggleCollapsed={jest.fn()}
          onChange={jest.fn(async () => undefined)}
          onSetValue={jest.fn()}
          onComplete={onComplete}
          onAddSet={jest.fn()}
          onSetOptions={jest.fn()}
          onUncomplete={jest.fn()}
          onRemoveSet={jest.fn()}
          showRpe
          onRpe={jest.fn()}
          onOptions={jest.fn()}
          onToggleWarmup={jest.fn()}
          onFormRating={jest.fn()}
          {...props}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onComplete };
}

describe('ExerciseCard table rows', () => {
  beforeAll(async () => { await i18n.changeLanguage('en'); });
  // The theme reads the font scale from this simulation hook, so every test states it.
  const fontScale = (value: number) => { (globalThis as { __fontScale?: number }).__fontScale = value; };
  beforeEach(() => fontScale(1));
  afterAll(() => { delete (globalThis as { __fontScale?: number }).__fontScale; });

  it('opens only the set to do next, with one row per set', () => {
    show([set(1, { completedAt: new Date(), rpe: 8, formRating: 4 }), set(2), set(3)]);
    // Closed rows are buttons; the set to do next (2) is open, so its value is the editable field of its one row.
    expect(screen.getAllByRole('button', { name: /^Set [13] ·/ })).toHaveLength(2);
    expect(screen.getAllByLabelText('Set 2 options')).toHaveLength(1);
    expect(screen.getAllByLabelText(/Complete set/)).toHaveLength(1);
  });

  it('opens and closes a row on tap', () => {
    show([set(1, { completedAt: new Date(), rpe: 8, formRating: 4 }), set(2), set(3)]);
    fireEvent.press(screen.getByRole('button', { name: /^Set 3 ·/ }));
    expect(screen.getAllByLabelText('Set 3 options')).toHaveLength(1);
    fireEvent.press(screen.getAllByRole('button', { name: /^Close$/ }).at(-1)!);
    expect(screen.queryAllByLabelText('Set 3 options')).toHaveLength(0);
  });

  it('keeps a done set open until its form is rated', () => {
    show([set(1, { completedAt: new Date(), rpe: 8 }), set(2, { completedAt: new Date(), rpe: 8, formRating: 4 }), set(3)]);
    // Set 2 is the last one done and rated: closed. Set 1 is not the last done: closed. Set 3 is next: open.
    expect(screen.queryAllByLabelText('Set 1 options')).toHaveLength(0);
    expect(screen.queryAllByLabelText('Set 2 options')).toHaveLength(0);
    expect(screen.getAllByLabelText('Set 3 options')).toHaveLength(1);
  });

  it('opens the last done set while its form is missing', () => {
    show([set(1, { completedAt: new Date(), rpe: 8 }), set(2)]);
    expect(screen.getAllByLabelText('Set 1 options')).toHaveLength(1);
  });

  it('shows the set in the row values', () => {
    show([set(1, { completedAt: new Date(), rpe: 7.5, formRating: 4, reps: 9, addedLoadKg: 62.5 })]);
    expect(screen.getByText('+62.5')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText('7.5')).toBeTruthy();
  });

  it('keeps the large-text layout at very large font sizes', () => {
    fontScale(2);
    show([set(1, { completedAt: new Date(), rpe: 8, formRating: 4 }), set(2), set(3)]);
    expect(screen.queryAllByRole('button', { name: /^Set [123]/ }).filter((node) => node.props.accessibilityState?.expanded !== undefined)).toHaveLength(0);
  });

  it('switches a set between working and warm-up from its numbered circle', () => {
    const onToggleWarmup = jest.fn();
    show([set(1, { completedAt: new Date(), rpe: 8, formRating: 4 }), set(2), set(3)], { onToggleWarmup });
    fireEvent.press(screen.getByLabelText('Set 3, tap to mark as warm-up'));
    expect(onToggleWarmup).toHaveBeenCalledTimes(1);
    expect(onToggleWarmup.mock.calls[0][0].id).toBe('s3');
  });

  it('does not use rows in a finished workout', () => {
    show([set(1, { completedAt: new Date() }), set(2, { completedAt: new Date() })], { editDone: true });
    expect(screen.queryAllByRole('button', { name: /^Set [12] ·/ }).filter((node) => node.props.accessibilityState?.expanded !== undefined)).toHaveLength(0);
  });
});
