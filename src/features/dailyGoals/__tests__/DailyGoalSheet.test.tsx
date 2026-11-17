import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { DailyGoal } from '../../../domain/dailyGoals';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { DailyGoalSheet, type GoalDraft } from '../DailyGoalSheet';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
// The picker is a full-screen search of its own: here it just offers one timed exercise.
jest.mock('../../exercises/ExercisePicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    ExercisePicker: ({ visible, include, onChoose }: { visible: boolean; include?: (choice: { metric: string }) => boolean; onChoose: (choice: unknown) => void }) => (visible
      ? <Pressable accessibilityRole="button" accessibilityLabel="pick-plank" onPress={() => onChoose({ id: 'plank', name: 'Plank', metric: 'time', category: 'core', extraCategories: '[]', level: null })}>
        <Text>{`only time: ${include?.({ metric: 'time' }) === true && include?.({ metric: 'reps' }) === false}`}</Text>
      </Pressable>
      : null),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, string>) => String(i18n.t(key, options as never));

function renderSheet(props: { initial: GoalDraft | null; goals?: readonly DailyGoal[]; period?: 'day' | 'week' }) {
  const onSave = jest.fn();
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider>
    <DailyGoalSheet visible period={props.period ?? 'day'} initial={props.initial} goals={props.goals} onSave={onSave} onClose={jest.fn()} />
  </ThemeProvider></SafeAreaProvider>);
  return onSave;
}
const newDraft: GoalDraft = { scope: 'exercise', key: 'plank', measure: 'minutes', target: 180, label: 'Plank' };
const addButton = (amount = '3:00') => screen.getByRole('button', { name: new RegExp(`^${t('dailyGoals.addSummary', { name: 'Plank', amount }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });

beforeAll(async () => { await i18n.changeLanguage('en'); });

describe('DailyGoalSheet, goals on one exercise', () => {
  it('saves a time goal on the exercise it was opened on, with no measure to choose', () => {
    const onSave = renderSheet({ initial: newDraft });
    expect(screen.queryByText(t('dailyGoals.measureTitle'))).toBeNull();
    fireEvent.press(addButton());
    expect(onSave).toHaveBeenCalledWith({ drafts: [{ id: undefined, scope: 'exercise', key: 'plank', measure: 'minutes', target: 180 }], removeIds: [] });
  });

  it('edits the goal the exercise already has instead of adding a second one', () => {
    const existing: DailyGoal = { id: 'g1', scope: 'exercise', key: 'plank', measure: 'minutes', target: 60 };
    const onSave = renderSheet({ initial: newDraft, goals: [existing] });
    fireEvent.press(addButton());
    expect(onSave).toHaveBeenCalledWith({ drafts: [expect.objectContaining({ id: 'g1', key: 'plank', target: 180 })], removeIds: [] });
  });

  it('picks an exercise measured in time, from the scope chip', () => {
    const onSave = renderSheet({ initial: null });
    fireEvent.press(screen.getByRole('button', { name: t('dailyGoals.scope.exercise') }));
    fireEvent.press(screen.getByRole('button', { name: t('dailyGoals.pickExercise') }));
    expect(screen.getByText('only time: true')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'pick-plank' }));
    // A new goal starts from the sheet's own default (one minute a day).
    fireEvent.press(addButton('1:00'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ drafts: [expect.objectContaining({ scope: 'exercise', key: 'plank', measure: 'minutes' })] }));
  });
});
