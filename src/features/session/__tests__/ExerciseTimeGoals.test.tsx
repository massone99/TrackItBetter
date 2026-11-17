import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { DailyGoalProgress } from '../../../domain/dailyGoals';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ExerciseTimeGoals } from '../ExerciseTimeGoals';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const progress = (target: number, done: number): DailyGoalProgress => ({
  goal: { id: 'g', scope: 'exercise', key: 'plank', measure: 'minutes', target },
  done, reached: done >= target, remaining: Math.max(0, target - done), contributions: [],
});
const show = (goals: Parameters<typeof ExerciseTimeGoals>[0]['goals']) => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ExerciseTimeGoals goals={goals} /></ThemeProvider></SafeAreaProvider>);

beforeAll(async () => { await i18n.changeLanguage('en'); });

describe('ExerciseTimeGoals', () => {
  it('shows today and the week with what is done, and says when a goal is reached', () => {
    show({ day: progress(300, 80), week: progress(1200, 1300) });
    expect(screen.getByText('Today 1:20 / 5:00')).toBeTruthy();
    expect(screen.getByText('Week 21:40 / 20:00')).toBeTruthy();
    expect(screen.getByLabelText('Today: 1:20 of 5:00')).toBeTruthy();
    expect(screen.getByLabelText('Week: 21:40 of 20:00, goal reached')).toBeTruthy();
  });

  it('shows only the goals the exercise has', () => {
    show({ day: null, week: progress(600, 0) });
    expect(screen.queryByText(/^Today/)).toBeNull();
    expect(screen.getByText('Week 0:00 / 10:00')).toBeTruthy();
  });
});
