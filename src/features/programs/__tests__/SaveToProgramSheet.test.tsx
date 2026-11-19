import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import type { UserProgram } from '../../../domain/userProgram';
import { isPrescriptionHandled } from '../prescriptionHandled';
import { SaveToProgramSheet } from '../SaveToProgramSheet';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('../userPrograms', () => ({ listUserPrograms: jest.fn() }));
jest.mock('../saveWorkout', () => ({ saveWorkoutToProgram: jest.fn() }));
const { listUserPrograms } = jest.requireMock('../userPrograms') as { listUserPrograms: jest.Mock };
const { saveWorkoutToProgram } = jest.requireMock('../saveWorkout') as { saveWorkoutToProgram: jest.Mock };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, string>) => String(i18n.t(key, options as never));
const program: UserProgram = {
  id: 'prog', name: 'PPL', updatedAt: '2026-01-01',
  sessions: [{ id: 'push', name: 'Push', exercises: [{ id: 'e1', exerciseId: 'push-up', sets: 3, target: 10 }] }],
};
const exercises = [{ exerciseId: 'push-up', metric: 'reps', notes: null, sets: [{ kind: 'working', reps: 10, durationSec: null, distanceM: null, addedLoadKg: 0, restSec: null }] }] as never;

async function renderSheet(defaultName: string) {
  listUserPrograms.mockResolvedValue([program]);
  const onSaved = jest.fn();
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider>
    <SaveToProgramSheet visible defaultName={defaultName} workoutId="w1" exercises={exercises} onClose={jest.fn()} onSaved={onSaved} />
  </ThemeProvider></SafeAreaProvider>);
  // The programs load, and the latest one is picked as the destination.
  await screen.findByText('PPL');
  return onSaved;
}
const save = async () => { await act(async () => { fireEvent.press(screen.getByRole('button', { name: new RegExp(`^(${t('saveToProgram.save')}|${t('saveToProgram.replace')})$`) })); }); };

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => { jest.clearAllMocks(); saveWorkoutToProgram.mockImplementation(async () => program); });

describe('SaveToProgramSheet', () => {
  it('saves under a new name straight away, with no choice to make and nothing replaced', async () => {
    await renderSheet('Pull');
    expect(screen.queryByText(t('saveToProgram.keepTitle'))).toBeNull();
    await save();
    expect(saveWorkoutToProgram).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'existing', programId: 'prog' }, workoutName: 'Pull' }));
  });

  it('asks when the name is already a workout of that program, and by default keeps the original', async () => {
    const onSaved = await renderSheet('Push');
    expect(screen.getByText(t('saveToProgram.keepTitle'))).toBeTruthy();
    expect(screen.getByText(t('saveToProgram.replaceTitle'))).toBeTruthy();
    await save();
    expect(saveWorkoutToProgram).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'existing', programId: 'prog' }, workoutName: 'Push (2)' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    // Saved from a workout in progress: finishing it must not offer to update the original afterwards.
    expect(isPrescriptionHandled('w1')).toBe(true);
  });

  it('replaces the original only when that is chosen', async () => {
    await renderSheet('Push');
    fireEvent.press(screen.getByRole('radio', { name: new RegExp(t('saveToProgram.replaceTitle')) }));
    // The destination no longer matters: the workout is replaced where it is.
    expect(screen.queryByText(t('saveToProgram.where'))).toBeNull();
    await save();
    expect(saveWorkoutToProgram).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'replace', programId: 'prog', sessionId: 'push' } }));
  });
});
