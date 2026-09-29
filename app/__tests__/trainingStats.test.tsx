import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../src/shared/i18n';
import { ThemeProvider } from '../../src/shared/theme/ThemeProvider';
import type { StatsSetRow } from '../../src/features/analytics/trainingStats';
import TrainingStatsScreen from '../training-stats';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useSegments: () => ['training-stats'],
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../src/features/analytics/repository', () => ({ getTrainingStatsRows: jest.fn() }));
jest.mock('../../src/shared/settings/preferences', () => ({ readPreference: () => null, writePreference: jest.fn() }));
const { getTrainingStatsRows } = jest.requireMock('../../src/features/analytics/repository');

const started = new Date();
const row = (over: Partial<StatsSetRow>): StatsSetRow => ({
  workoutId: 'w1', workoutName: 'Allenamento', workoutStartedAt: started, exerciseId: 'push-up', exerciseName: 'Push-up',
  metric: 'reps', movementGroup: 'horizontal-push', movementTag: null, reps: 8, durationSec: null, addedLoadKg: 0, rpe: null, ...over,
});
const rows = [
  row({ rpe: 7 }),
  row({ rpe: 7 }),
  row({ rpe: 7 }),
  row({ exerciseId: 'pull-up', exerciseName: 'Pull-up', movementGroup: 'vertical-pull', rpe: 9 }),
];

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><TrainingStatsScreen /></ThemeProvider></SafeAreaProvider>);

beforeAll(async () => { await i18n.changeLanguage('it'); });
beforeEach(() => { getTrainingStatsRows.mockResolvedValue(rows); });

describe('training totals RPE filter', () => {
  it('counts only hard sets once the RPE filter is on', async () => {
    renderScreen();
    expect(await screen.findByText('4')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'RPE ≥ 8' }));

    expect(screen.queryByText('4')).toBeNull();
    expect(screen.queryByText(i18n.t('movement.groups.horizontal-push'))).toBeNull();
    expect(screen.getByText(i18n.t('movement.groups.vertical-pull'))).toBeTruthy();
  });
});
