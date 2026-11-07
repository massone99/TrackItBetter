import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { WorkoutHeader } from '../WorkoutHeader';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() } }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function show() {
  const handlers = { onTitleLongPress: jest.fn(), onMenu: jest.fn() };
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <WorkoutHeader
          title="Push day" startedAt={new Date()} done={3} total={7} volumeKg={119.6}
          titleLongPressLabel="Hold to rename" {...handlers}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return handlers;
}

beforeAll(() => { void i18n.changeLanguage('en'); });

describe('WorkoutHeader', () => {
  it('shows the name, the sets and the volume on one summary line', () => {
    show();
    expect(screen.getByText('Push day')).toBeTruthy();
    expect(screen.getByText('· 3/7 sets · 120 kg')).toBeTruthy();
    expect(screen.getByLabelText('3 of 7 sets, 120 kg')).toBeTruthy();
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('opens the menu and keeps the long press on the name', () => {
    const handlers = show();
    fireEvent.press(screen.getByLabelText('Workout menu'));
    expect(handlers.onMenu).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole('header'), 'longPress');
    expect(handlers.onTitleLongPress).toHaveBeenCalledTimes(1);
  });
});
