import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';
import { setPendingExercise } from '../../src/features/programs/pendingExercise';
import ProgramWorkout from '../program-workout';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: (value: unknown) => value,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const chain: object = new Proxy(() => chain, { get: () => () => chain });
  return { Gesture: { Pan: () => chain }, GestureDetector: ({ children }: { children: unknown }) => children };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'session-1') }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ programId: 'program-1', sessionId: 'session-1' }),
    useSegments: () => ['program-builder'],
    useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../src/features/exercises/repository', () => ({
  listExercises: jest.fn(async () => [
    { id: 'push-up', name: 'Push-up', metric: 'reps', category: 'push', extraCategories: '[]', level: null },
    { id: 'my-hold', name: 'My Hold', metric: 'time', category: 'core', extraCategories: '[]', level: null },
  ]),
}));
jest.mock('../../src/features/programs/userPrograms', () => ({ getUserProgram: jest.fn(), updateUserProgram: jest.fn() }));
jest.mock('../../src/features/programs/startUserSession', () => ({ startUserProgramSession: jest.fn(async () => 'workout-1') }));
jest.mock('../../src/features/session/repository', () => ({ getActiveWorkout: jest.fn(async () => null) }));
const { router } = jest.requireMock('expo-router');
const { getUserProgram, updateUserProgram } = jest.requireMock('../../src/features/programs/userPrograms');

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ProgramWorkout /></ThemeProvider></SafeAreaProvider>);
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const program = (exercises: object[] = []) => ({ id: 'program-1', name: 'Plan', updatedAt: '', sessions: [{ id: 'session-1', name: 'A', exercises }] });
const oldPushUp = { id: 'old', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: null };

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => {
  jest.clearAllMocks();
  getUserProgram.mockResolvedValue(program());
});

describe('program workout screen', () => {
  it('shows an empty workout with its name and the add actions', async () => {
    renderScreen();
    expect(await screen.findByText(t('workoutBuilder.emptyTitle'))).toBeTruthy();
    expect(screen.getByDisplayValue('A')).toBeTruthy();
    expect(screen.getByRole('button', { name: t('programBuilder.addExercise') })).toBeTruthy();
  });

  it('writes each prescription in one line and sums the workout', async () => {
    getUserProgram.mockResolvedValue(program([{ ...oldPushUp, sets: 4, target: 6, rpe: 8, restSeconds: 120 }]));
    renderScreen();
    expect(await screen.findByText('4 × 6 @8 · 2:00')).toBeTruthy();
    expect(screen.getByText(/1 exercise · 4 working sets/)).toBeTruthy();
  });

  it('sends the new exercise to this workout', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addExercise') }));
    fireEvent.press(await screen.findByText(t('logger.createExercise')));
    expect(router.push.mock.calls[0][0].params).toEqual({ addToProgram: 'session-1' });
  });

  it('adds an exercise created in the meantime when coming back', async () => {
    setPendingExercise({ sessionId: 'session-1', exerciseId: 'my-hold', metric: 'time' });
    renderScreen();
    expect((await screen.findAllByText('My Hold')).length).toBeGreaterThan(0);
  });

  it('replaces a movement with the exercise created for it, keeping its place', async () => {
    getUserProgram.mockResolvedValue(program([oldPushUp]));
    setPendingExercise({ sessionId: 'session-1', exerciseId: 'my-hold', metric: 'time', replaceId: 'old' });
    renderScreen();
    expect(await screen.findByText('My Hold')).toBeTruthy();
    expect(screen.queryByText('Push-up')).toBeNull();
  });

  it('prefills the picker with a quick-add name that matched nothing', async () => {
    renderScreen();
    fireEvent.changeText(await screen.findByPlaceholderText(t('builderPlus.quickPlaceholder')), 'zzz 3x10');
    fireEvent.press(screen.getByRole('button', { name: t('builderPlus.quickAdd') }));
    expect((await screen.findByPlaceholderText(t('workout.search'))).props.value).toBe('zzz');
  });

  it('moves an exercise to another block from its menu', async () => {
    getUserProgram.mockResolvedValue(program([oldPushUp]));
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('workoutBuilder.rowMenu', { name: 'Push-up' }) }));
    fireEvent.press(await screen.findByText(t('workoutBuilder.moveTo', { block: t('workout.blocks.warmup') })));
    expect(await screen.findByText(t('workout.blocks.warmup'))).toBeTruthy();
  });

  it('removes an exercise with an undo toast', async () => {
    getUserProgram.mockResolvedValue(program([oldPushUp]));
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('workoutBuilder.rowMenu', { name: 'Push-up' }) }));
    fireEvent.press(await screen.findByText(t('userProgram.removeExercise', { name: 'Push-up' })));
    expect(await screen.findByText(t('userProgram.exerciseRemoved', { name: 'Push-up' }))).toBeTruthy();
    fireEvent.press(screen.getByText(t('userProgram.undo')));
    expect(await screen.findByText('Push-up')).toBeTruthy();
  });

  it('saves into the program and starts the workout', async () => {
    getUserProgram.mockResolvedValue(program([oldPushUp]));
    updateUserProgram.mockImplementation(async () => program([oldPushUp]));
    renderScreen();
    fireEvent.changeText(await screen.findByDisplayValue('A'), 'Push day');
    fireEvent.press(screen.getByRole('button', { name: t('workoutBuilder.startNow') }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: 'workout-1' } }));
    expect(updateUserProgram).toHaveBeenCalledTimes(1);
  });
});
