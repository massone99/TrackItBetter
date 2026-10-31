import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
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

  it('names the state and shows RPE, form and ROM as a value or a dash', () => {
    show([set(1), set(2)]);
    expect(screen.getByText('● In progress')).toBeTruthy();
    expect(screen.getByLabelText('RPE —')).toBeTruthy();
    expect(screen.getByLabelText('FORM —')).toBeTruthy();
    expect(screen.getByLabelText('ROM —')).toBeTruthy();
    expect(screen.getByText('TARGET 8')).toBeTruthy();
  });

  it('shows a given rating in its cell and opens that picker only', () => {
    show([set(1, { rpe: 8.5, formRating: 4 })]);
    const cell = (label: string) => screen.getAllByLabelText(label).find((node) => node.props.accessibilityState?.expanded !== undefined)!;
    expect(cell('FORM 4')).toBeTruthy();
    fireEvent.press(cell('FORM 4'));
    expect(cell('FORM 4').props.accessibilityState).toMatchObject({ expanded: true });
    expect(cell('RPE 8.5').props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('keeps the band strip for an exercise that uses bands and opens its editor in place', () => {
    const banded = set(1, { bands: [{ bandId: 'blue', tension: 2 }], assistKg: null });
    show([banded, set(2)], { describeBands: () => ({ colors: ['#2F80ED'], text: 'Blue · 2' }), renderBandsEditor: () => <Text>band editor</Text> });
    expect(screen.getAllByText('Blue · 2').length).toBeGreaterThan(0);
    expect(screen.getByText('KG NOT AVAILABLE')).toBeTruthy();
    expect(screen.queryByText('band editor')).toBeNull();
    fireEvent.press(screen.getByLabelText('EDIT BANDS'));
    expect(screen.getByText('band editor')).toBeTruthy();
  });

  it('has no band strip for an exercise without bands, and More details opens the set menu', () => {
    const { onSetOptions } = show([set(1)]);
    expect(screen.queryByText('↳ RESISTANCE BANDS / SET ASSISTANCE')).toBeNull();
    fireEvent.press(screen.getByLabelText('More set details'));
    expect(onSetOptions).toHaveBeenCalled();
  });
});
