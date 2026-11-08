import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';
import ProgramBuilder from '../program-builder';

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
    useLocalSearchParams: () => ({ id: 'program-1' }),
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
jest.mock('../../src/features/programs/userPrograms', () => ({ getUserProgram: jest.fn(), saveUserProgram: jest.fn() }));
const { router } = jest.requireMock('expo-router');
const { getUserProgram, saveUserProgram } = jest.requireMock('../../src/features/programs/userPrograms');

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ProgramBuilder /></ThemeProvider></SafeAreaProvider>);
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => {
  jest.clearAllMocks();
  getUserProgram.mockResolvedValue({ id: 'program-1', name: 'Plan', updatedAt: '', sessions: [{ id: 'session-1', name: 'A', exercises: [{ id: 'old', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: null }] }] });
});

describe('program builder', () => {
  it('starts a new program with no workouts', async () => {
    getUserProgram.mockResolvedValue(null);
    renderScreen();
    expect(await screen.findByText(t('userProgram.noWorkoutsYet'))).toBeTruthy();
  });

  it('lists each workout as a compact row that opens its own screen', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('workoutBuilder.openWorkout', { name: 'A' }) }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/program-workout', params: { programId: 'program-1', sessionId: 'session-1' } }));
  });

  it('adds a workout on the new screen, saving the program first', async () => {
    saveUserProgram.mockResolvedValue({ id: 'program-1', name: 'Plan', updatedAt: '', sessions: [] });
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addDay') }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/program-workout', params: { programId: 'program-1', sessionId: 'new' } }));
  });

  it('asks for a program name before adding the first workout', async () => {
    getUserProgram.mockResolvedValue(null);
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addDay') }));
    expect(await screen.findByText(t('userProgram.errors.nameMissing'))).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('removes a workout from its menu with an undo', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('workoutBuilder.rowMenu', { name: 'A' }) }));
    fireEvent.press(await screen.findByText(t('programBuilder.removeDay')));
    expect(await screen.findByText(t('userProgram.dayRemoved', { name: 'A' }))).toBeTruthy();
    fireEvent.press(screen.getByText(t('userProgram.undo')));
    expect(await screen.findByRole('button', { name: t('workoutBuilder.openWorkout', { name: 'A' }) })).toBeTruthy();
  });
});
