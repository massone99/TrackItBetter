import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import UserProgramScreen from '../program/user/[id]';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';

jest.mock('../../src/shared/settings/preferences', () => {
  const store = new Map<string, string>();
  return {
    ...jest.requireActual('../../src/shared/settings/preferences'),
    readPreference: (key: string) => store.get(key) ?? null,
    writePreference: (key: string, value: string) => { store.set(key, value); },
    readBooleanPreference: (key: string, fallback: boolean) => {
      const val = store.get(key);
      return val === undefined ? fallback : val === 'true';
    },
    __resetMockPrefs: () => store.clear(),
  };
});
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
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'id-1') }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'program-1' }),
    useSegments: () => ['program', 'user', 'program-1'],
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../src/features/exercises/repository', () => ({
  listExercises: jest.fn(async () => [
    { id: 'push-up', name: 'Push-up', metric: 'reps', category: 'push', extraCategories: '[]', level: null },
  ]),
}));
jest.mock('../../src/features/session/repository', () => ({
  getActiveWorkout: jest.fn(async () => null),
  listRecentWorkoutNames: jest.fn(async () => []),
}));
jest.mock('../../src/features/programs/userPrograms', () => ({
  getUserProgram: jest.fn(async () => ({
    id: 'program-1',
    name: 'Plan',
    category: 'Strength',
    author: 'Tom Merrick',
    updatedAt: '',
    sessions: [
      { id: 's1', name: 'Upper Push', exercises: [{ id: 'e1', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: null }] },
    ],
  })),
  listUserPrograms: jest.fn(async () => []),
  saveUserProgram: jest.fn(),
  updateUserProgram: jest.fn(),
  duplicateUserProgram: jest.fn(),
  deleteUserProgram: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const { __resetMockPrefs } = jest.requireMock('../../src/shared/settings/preferences');

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => { __resetMockPrefs(); });

describe('UserProgramScreen author, category, and barebone mode', () => {
  it('shows category and author chips and toggles barebone workout rows', async () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <UserProgramScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect((await screen.findAllByRole('button', { name: 'Strength' })).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Tom Merrick' })).toBeTruthy();
    expect(screen.getByText(/3 sets/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: t('programsList.barebone') }));
    expect(screen.queryByText(/3 sets/)).toBeNull();
    expect(screen.getByText('Upper Push')).toBeTruthy();
  });
});
