import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';
import { setPendingExercise } from '../../src/features/programs/pendingExercise';
import ProgramBuilder from '../program-builder';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'session-1') }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
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

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ProgramBuilder /></ThemeProvider></SafeAreaProvider>);
const t = (key: string) => i18n.t(key);

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => jest.clearAllMocks());

describe('program builder', () => {
  it('sends the new exercise to the workout it was created for', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addExercise') }));
    fireEvent.press(await screen.findByText(t('logger.createExercise')));
    const [{ params }] = router.push.mock.calls.map(([target]: [{ params: object }]) => target);
    expect(params).toEqual({ addToProgram: expect.any(String) });
  });

  it('adds an exercise created in the meantime to that workout when coming back', async () => {
    const first = renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addExercise') }));
    fireEvent.press(await screen.findByText(t('logger.createExercise')));
    const { params } = router.push.mock.calls[0][0];
    first.unmount();

    setPendingExercise({ sessionId: params.addToProgram, exerciseId: 'my-hold', metric: 'time' });
    renderScreen();

    expect(await screen.findByText('My Hold')).toBeTruthy();
    expect(screen.getByText(t('metric.time'))).toBeTruthy();
  });

  it('starts every opening of the picker with a clean search', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addExercise') }));
    fireEvent.changeText(await screen.findByPlaceholderText(t('workout.search')), 'push');
    fireEvent.press(await screen.findByRole('button', { name: t('workout.close') }));

    fireEvent.press(await screen.findByRole('button', { name: t('programBuilder.addExercise') }));
    expect((await screen.findByPlaceholderText(t('workout.search'))).props.value).toBe('');
  });
});
