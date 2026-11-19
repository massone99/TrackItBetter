import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { WorkoutInProgressSheet } from '../WorkoutInProgressSheet';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useSegments: () => [] }));
jest.mock('../discardWorkout', () => ({ discardActiveWorkout: jest.fn(async () => undefined) }));
const { router } = jest.requireMock('expo-router');
const { discardActiveWorkout } = jest.requireMock('../discardWorkout') as { discardActiveWorkout: jest.Mock };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, string>) => String(i18n.t(key, options as never));
const renderSheet = (onClose = jest.fn(), onDiscarded?: () => void) => {
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><WorkoutInProgressSheet active={{ id: 'w1', name: 'Upper A' }} onClose={onClose} onDiscarded={onDiscarded} /></ThemeProvider></SafeAreaProvider>);
  return onClose;
};

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => jest.clearAllMocks());

describe('WorkoutInProgressSheet', () => {
  it('names the open workout and offers to resume it', () => {
    const onClose = renderSheet();
    expect(screen.getByText(t('workout.inProgressTitle'))).toBeTruthy();
    expect(screen.getByText(t('workout.inProgressBody', { name: 'Upper A' }))).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: t('common.resumeWorkout') }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: 'w1' } });
    expect(onClose).toHaveBeenCalled();
  });

  it('can be dismissed without resuming', () => {
    const onClose = renderSheet();
    fireEvent.press(screen.getAllByRole('button', { name: t('common.close') }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('offers no discard when the caller cannot carry on with the start', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: t('workout.inProgressDiscard') })).toBeNull();
  });

  it('discards the open workout only after a confirmation, then carries on with the start', async () => {
    const onDiscarded = jest.fn();
    const onClose = jest.fn();
    renderSheet(onClose, onDiscarded);
    fireEvent.press(screen.getByRole('button', { name: t('workout.inProgressDiscard') }));
    // Nothing is deleted yet: the sheet asks first, naming the workout.
    expect(discardActiveWorkout).not.toHaveBeenCalled();
    expect(screen.getByText(t('workout.inProgressDiscardBody', { name: 'Upper A' }))).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: t('workout.inProgressDiscardConfirm') })); });
    await waitFor(() => expect(onDiscarded).toHaveBeenCalledTimes(1));
    expect(discardActiveWorkout).toHaveBeenCalledWith('w1');
    expect(router.push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('goes back from the confirmation without discarding', () => {
    const onDiscarded = jest.fn();
    renderSheet(jest.fn(), onDiscarded);
    fireEvent.press(screen.getByRole('button', { name: t('workout.inProgressDiscard') }));
    fireEvent.press(screen.getByRole('button', { name: t('common.back') }));
    expect(discardActiveWorkout).not.toHaveBeenCalled();
    expect(onDiscarded).not.toHaveBeenCalled();
    expect(screen.getByText(t('workout.inProgressTitle'))).toBeTruthy();
  });

  it('keeps the workout and says so when discarding fails', async () => {
    discardActiveWorkout.mockRejectedValueOnce(new Error('disk'));
    const onDiscarded = jest.fn();
    renderSheet(jest.fn(), onDiscarded);
    fireEvent.press(screen.getByRole('button', { name: t('workout.inProgressDiscard') }));
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: t('workout.inProgressDiscardConfirm') })); });
    await waitFor(() => expect(screen.getByText(t('workout.inProgressDiscardError'))).toBeTruthy());
    expect(onDiscarded).not.toHaveBeenCalled();
  });
});
