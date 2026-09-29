import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { WorkoutInProgressSheet } from '../WorkoutInProgressSheet';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useSegments: () => [] }));
const { router } = jest.requireMock('expo-router');

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, string>) => String(i18n.t(key, options as never));
const renderSheet = (onClose = jest.fn()) => {
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><WorkoutInProgressSheet active={{ id: 'w1', name: 'Upper A' }} onClose={onClose} /></ThemeProvider></SafeAreaProvider>);
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
});
