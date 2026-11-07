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
    withDelay: (_delay: number, value: unknown) => value,
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
  id: `s${index}`, index, kind: 'working', reps: 8, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null, rir: null,
  side: 'both', pairId: null, tempo: null, restSec: null, targetRpe: 8, formRating: null, romRating: null, note: null,
  bands: [], assistKg: null, completedAt: null, clipCount: 0, poseCount: 0, ...patch,
}) as unknown as SessionSet;

function show(sets: SessionSet[], props: Partial<Parameters<typeof ExerciseCard>[0]> = {}) {
  const exercise = { entryId: 'e1', exerciseId: 'pull-up', name: 'Pull-up', metric: 'reps', sets, notes: null, groupId: null, block: null, mobility: false } as unknown as SessionExercise;
  const onSetOptions = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ExerciseCard
          exercise={exercise} collapsed={false} focus onToggleCollapsed={jest.fn()} onChange={jest.fn(async () => undefined)} onSetValue={jest.fn()}
          onComplete={jest.fn()} onAddSet={jest.fn()} onSetOptions={onSetOptions} onUncomplete={jest.fn()} onRemoveSet={jest.fn()} showRpe onRpe={jest.fn()}
          onOptions={jest.fn()} onToggleWarmup={jest.fn()} onFormRating={jest.fn()} onRomRating={jest.fn()} {...props}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onSetOptions };
}

describe('active set in focus mode', () => {
  beforeAll(async () => { await i18n.changeLanguage('en'); });

  it('draws the set in hand with its optional chips, pickers closed', () => {
    show([set(1), set(2)]);
    // Jest runs at large text, where the column header is hidden; no picker opens by itself.
    expect(screen.queryByText('Effort (RPE)')).toBeNull();
    expect(screen.getAllByLabelText(/^RPE/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^FORM/)).toBeTruthy();
    expect(screen.getByLabelText(/^ROM/)).toBeTruthy();
    expect(screen.getByLabelText('+ BANDS')).toBeTruthy();
  });

  it('a rating chip opens only its own picker', () => {
    show([set(1, { rpe: 8.5, formRating: 4 })]);
    const chip = (pattern: RegExp) => screen.getAllByLabelText(pattern).find((node) => node.props.accessibilityState?.expanded !== undefined)!;
    fireEvent.press(chip(/^FORM/));
    expect(chip(/^FORM/).props.accessibilityState).toMatchObject({ expanded: true });
    expect(chip(/RPE/).props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('the bands and rest chips open their own settings, not the generic set menu', () => {
    const { onSetOptions } = show([set(1)], { defaultRest: 90 });
    fireEvent.press(screen.getByLabelText('+ BANDS'));
    expect(onSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), 'bands');
    fireEvent.press(screen.getByLabelText(/^REST/));
    expect(onSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), 'rest');
  });

  it('done and upcoming sets are single rows; a tap opens the one tapped', () => {
    show([set(1, { completedAt: new Date() as unknown as SessionSet['completedAt'] }), set(2), set(3)]);
    // Set 2 is in hand: one complete button.
    expect(screen.getAllByLabelText(/^Complete/i)).toHaveLength(1);
    const rows = screen.getAllByRole('button').filter((node) => /set 3/i.test(String(node.props.accessibilityLabel ?? '')));
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.press(rows[0]);
    expect(screen.getAllByLabelText(/^Complete/i)).toHaveLength(1);
  });
});
