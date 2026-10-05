import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../i18n';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AUTOSAVE_DELAY_MS, NumberEdit } from '../ui';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useSegments: () => ['x'] }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider>{ui}</ThemeProvider></SafeAreaProvider>);

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });
const pause = () => act(() => { jest.advanceTimersByTime(AUTOSAVE_DELAY_MS); });

describe('NumberEdit', () => {
  it('saves once typing pauses, without waiting for confirmation', () => {
    const onCommit = jest.fn();
    wrap(<NumberEdit value={3} display="3" label="Sets" onCommit={onCommit} />);
    fireEvent.press(screen.getByRole('button', { name: 'Sets' }));
    fireEvent.changeText(screen.getByLabelText('Sets'), '1');
    fireEvent.changeText(screen.getByLabelText('Sets'), '12');
    expect(onCommit).not.toHaveBeenCalled();
    pause();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });

  it('saves at once when the field is left, and not again after the pause', () => {
    const onCommit = jest.fn();
    wrap(<NumberEdit value={3} display="3" label="Sets" onCommit={onCommit} />);
    fireEvent.press(screen.getByRole('button', { name: 'Sets' }));
    fireEvent.changeText(screen.getByLabelText('Sets'), '8');
    fireEvent(screen.getByLabelText('Sets'), 'blur');
    expect(onCommit).toHaveBeenCalledWith(8);
    pause();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('saves a pending value when the screen goes away', () => {
    const onCommit = jest.fn();
    const view = wrap(<NumberEdit value={3} display="3" label="Sets" onCommit={onCommit} />);
    fireEvent.press(screen.getByRole('button', { name: 'Sets' }));
    fireEvent.changeText(screen.getByLabelText('Sets'), '9');
    view.unmount();
    expect(onCommit).toHaveBeenCalledWith(9);
  });

  it('ignores text that is not a number yet', () => {
    const onCommit = jest.fn();
    wrap(<NumberEdit value={3} display="3" label="Sets" onCommit={onCommit} />);
    fireEvent.press(screen.getByRole('button', { name: 'Sets' }));
    fireEvent.changeText(screen.getByLabelText('Sets'), '');
    fireEvent.changeText(screen.getByLabelText('Sets'), 'abc');
    pause();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit again on blur when nothing changed after the last saved value', () => {
    const onCommit = jest.fn();
    const view = wrap(<NumberEdit value={3} display="3" label="Sets" onCommit={onCommit} />);
    fireEvent.press(screen.getByRole('button', { name: 'Sets' }));
    fireEvent.changeText(screen.getByLabelText('Sets'), '5');
    pause();
    view.rerender(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><NumberEdit value={5} display="5" label="Sets" onCommit={onCommit} /></ThemeProvider></SafeAreaProvider>);
    fireEvent(screen.getByLabelText('Sets'), 'blur');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
