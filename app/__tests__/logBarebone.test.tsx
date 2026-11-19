import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LogScreen from '../(tabs)/log';
import i18n from '../../src/shared/i18n';
import { LOG_BAREBONE_KEY } from '../../src/shared/settings/preferences';
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
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useSegments: () => ['(tabs)', 'log'],
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../src/features/session/PastWorkoutFlow', () => ({ PastWorkoutFlow: () => null }));
jest.mock('../../src/features/session/repository', () => ({
  getActiveWorkout: jest.fn(async () => null),
  listWorkoutStarts: jest.fn(async () => [new Date('2026-10-06T09:00:00Z')]),
  listWorkoutsBetween: jest.fn(async () => []),
  listWorkoutsPage: jest.fn(async () => [
    {
      id: 'w1',
      name: 'Upper Push',
      startedAt: new Date('2026-10-06T09:00:00Z'),
      endedAt: new Date('2026-10-06T10:15:00Z'),
      setCount: 18,
    },
    {
      id: 'w2',
      name: 'Lower Pull',
      startedAt: new Date('2026-10-04T09:00:00Z'),
      endedAt: new Date('2026-10-04T09:55:00Z'),
      setCount: 14,
    },
  ]),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
const mockPrefs = jest.requireMock('../../src/shared/settings/preferences');

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => {
  mockPrefs.__resetMockPrefs();
  jest.clearAllMocks();
});

function renderLog() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <LogScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('LogScreen barebone mode', () => {
  it('hides workout metadata when Names only is toggled and keeps tap navigation', async () => {
    renderLog();

    expect(await screen.findByText('Upper Push')).toBeTruthy();
    expect(screen.getByText(/75 min · 18 sets/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: t('programsList.barebone') }));

    expect(screen.queryByText(/75 min · 18 sets/)).toBeNull();
    expect(screen.queryByText(/55 min · 14 sets/)).toBeNull();
    expect(screen.getByText('Upper Push')).toBeTruthy();
    expect(screen.getByText('Lower Pull')).toBeTruthy();
    expect(mockPrefs.readPreference(LOG_BAREBONE_KEY)).toBe('true');

    fireEvent.press(screen.getByText('Upper Push'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/recap/[id]', params: { id: 'w1' } });
  });
});
