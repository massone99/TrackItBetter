import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';
import type { ExploreData } from '../../src/features/analytics/explore';
import StatsScreen from '../stats';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useSegments: () => ['stats'],
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../src/features/analytics/repository', () => ({ getExploreData: jest.fn() }));
const { getExploreData } = jest.requireMock('../../src/features/analytics/repository');

const started = new Date();
const base = { workoutId: 'w1', workoutStartedAt: started, bodyweightKg: 70, leverageFactor: null, durationSec: null, distanceM: null, addedLoadKg: 0, completedAt: started, rpe: null, metric: 'reps', reps: 8 };
let counter = 0;
const row = (over: object) => ({ ...base, setId: `s${counter += 1}`, extraCategories: '[]', ...over });
const data: ExploreData = {
  workouts: [{ id: 'w1', name: 'Allenamento', startedAt: started, endedAt: new Date(started.getTime() + 3_600_000), sessionRpe: null, sleep: null, energy: null, soreness: null }],
  rows: [
    row({ exerciseId: 'push-up', exerciseName: 'Push-up', category: 'push', movementPattern: 'horizontal-push' }),
    row({ exerciseId: 'dip', exerciseName: 'Dip', category: 'push', movementPattern: 'vertical-push' }),
    row({ exerciseId: 'pull-up', exerciseName: 'Pull-up', category: 'pull', movementPattern: 'vertical-pull' }),
    row({ exerciseId: 'tuck-planche', exerciseName: 'Tuck Planche', category: 'skill', extraCategories: '["push"]', movementPattern: 'horizontal-push', metric: 'time', reps: null, durationSec: 10 }),
  ] as unknown as ExploreData['rows'],
};

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string) => i18n.t(key);
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><StatsScreen /></ThemeProvider></SafeAreaProvider>);
const breakdownRow = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}:`) });

beforeAll(async () => { await i18n.changeLanguage('it'); });
beforeEach(() => { getExploreData.mockResolvedValue(data); });

describe('statistics drill-down', () => {
  it('splits by category with the multi-category exercise counted in each', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    expect(breakdownRow(t('library.category.push'))).toBeTruthy();
    expect(breakdownRow(t('library.category.skill'))).toBeTruthy();
    expect(breakdownRow(t('library.category.pull'))).toBeTruthy();
  });

  it('goes one level down when a row is tapped and back up with the back button', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));

    fireEvent.press(breakdownRow(t('library.category.push')));
    expect(await screen.findByText(t('stats.breakdown.pattern'))).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: t('stats.up') }));
    expect(await screen.findByText(t('stats.breakdown.category'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('stats.up') })).toBeNull();
  });

  it('steps back through every level, one at a time', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    fireEvent.press(breakdownRow(t('library.category.push')));
    await screen.findByText(t('stats.breakdown.pattern'));
    fireEvent.press(breakdownRow(t('movementPattern.horizontal-push')));
    await screen.findByText(t('stats.breakdown.exercise'));

    fireEvent.press(screen.getByRole('button', { name: t('stats.up') }));
    expect(await screen.findByText(t('stats.breakdown.pattern'))).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: t('stats.up') }));
    expect(await screen.findByText(t('stats.breakdown.category'))).toBeTruthy();
  });

  it('uses the phone back button to go up a level before leaving the screen', async () => {
    const handlers: (() => boolean | null | undefined)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      const call = () => handler({} as never);
      handlers.push(call);
      return { remove: () => { handlers.splice(handlers.indexOf(call), 1); } };
    });
    // Like the system: the newest handler answers first, and false lets the screen close.
    const pressBack = () => {
      let handled: boolean | null | undefined = false;
      act(() => { handled = handlers.length ? handlers[handlers.length - 1]() : false; });
      return Boolean(handled);
    };

    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    expect(pressBack()).toBe(false);

    fireEvent.press(breakdownRow(t('library.category.push')));
    await screen.findByText(t('stats.breakdown.pattern'));
    expect(pressBack()).toBe(true);
    expect(await screen.findByText(t('stats.breakdown.category'))).toBeTruthy();
    expect(pressBack()).toBe(false);
  });

  it('shows shares of the period total when categories overlap', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    // 4 sets: push has push-up, dip and the planche extra (3 of 4).
    expect(breakdownRow(t('library.category.push')).props.accessibilityLabel).toContain('75%');
  });

  it('names movements without a pattern instead of a dash', async () => {
    getExploreData.mockResolvedValue({ ...data, rows: [...data.rows, row({ exerciseId: 'x', exerciseName: 'Custom', category: 'push', movementPattern: null })] });
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    fireEvent.press(breakdownRow(t('library.category.push')));
    await screen.findByText(t('stats.breakdown.pattern'));
    expect(breakdownRow(t('stats.noPattern'))).toBeTruthy();
  });

  it('marks the current filter in the dropdown and offers "all" first', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    fireEvent.press(breakdownRow(t('library.category.push')));
    await screen.findByText(t('stats.breakdown.pattern'));

    fireEvent.press(screen.getByRole('button', { name: t('library.category.push') }));
    const choice = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}, .*${t('stats.metrics.sets').toLowerCase()}`) });
    expect(choice(t('library.category.push')).props.accessibilityState).toMatchObject({ selected: true });
    expect(choice(t('library.category.pull')).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByRole('button', { name: t('stats.any') }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('says so when a search finds nothing in the dropdown', async () => {
    renderScreen();
    await screen.findByText(t('stats.breakdown.category'));
    fireEvent.press(screen.getByRole('button', { name: new RegExp(`${t('stats.exercise')}:`) }));
    fireEvent.changeText(screen.getByPlaceholderText(t('stats.search')), 'zzzz');
    expect(await screen.findByText(t('stats.noMatches'))).toBeTruthy();
  });
});

