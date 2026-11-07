import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { EmomMiniDock, EmomStage, type EmomView } from '../EmomStage';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const view = (overrides: Partial<EmomView> = {}): EmomView => ({
  exercise: 'Push-up', intervalSec: 60, rounds: 10, phase: { phase: 'running', round: 4, secondsLeft: 37 },
  done: [8, 8, 7], value: 8, field: 'reps', canAddRound: true, ...overrides,
});

function showStage(overrides: Partial<EmomView> = {}) {
  const handlers = { onChange: jest.fn(), onAddRound: jest.fn(), onStop: jest.fn(), onClose: jest.fn() };
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <EmomStage view={view(overrides)} {...handlers} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return handlers;
}

beforeAll(() => { void i18n.changeLanguage('en'); });

describe('EmomStage', () => {
  it('shows the round and the clock, and adds one round or changes this round in one tap', () => {
    const handlers = showStage();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('/ 10')).toBeTruthy();
    expect(screen.getByText('0:37')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add round'));
    expect(handlers.onAddRound).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('This round +'));
    expect(handlers.onChange).toHaveBeenCalledWith(1);
  });

  it('stops only on a held press; a tap explains how', () => {
    const handlers = showStage();
    fireEvent.press(screen.getByLabelText('Stop EMOM'));
    expect(handlers.onStop).not.toHaveBeenCalled();
    expect(screen.getByText('Keep the button pressed to stop the EMOM')).toBeTruthy();
    fireEvent(screen.getByLabelText('Stop EMOM'), 'longPress');
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it('goes back to the workout without stopping, and refuses a round once the last one has started', () => {
    const handlers = showStage({ phase: { phase: 'running', round: 10, secondsLeft: 20 }, canAddRound: false });
    expect(screen.getByText('LAST ROUND')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add round'));
    expect(handlers.onAddRound).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Show the workout; the EMOM keeps running'));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).not.toHaveBeenCalled();
  });
});

describe('EmomMiniDock', () => {
  it('shows round and clock in one line and opens the full screen', () => {
    const onOpen = jest.fn();
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <EmomMiniDock view={view()} label="EMOM 4 / 10" onOpen={onOpen} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('EMOM 4 / 10')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('EMOM 4 / 10, Push-up, 0:37'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
