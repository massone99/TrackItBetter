import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Toast } from '../ui';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>{node}</ThemeProvider>
  </SafeAreaProvider>
);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Toast', () => {
  it('hides after 8 s even when the screen re-renders with a new onHide all the time (a running clock)', () => {
    const calls: number[] = [];
    const { rerender } = render(wrap(<Toast message="Round 11 added" onHide={() => calls.push(0)} />));
    // Four renders a second for 7.5 s, each with a fresh callback, as the EMOM screen does.
    for (let tick = 1; tick <= 30; tick += 1) {
      act(() => { jest.advanceTimersByTime(250); });
      rerender(wrap(<Toast message="Round 11 added" onHide={() => calls.push(tick)} />));
    }
    expect(calls).toHaveLength(0);
    act(() => { jest.advanceTimersByTime(600); });
    expect(calls.length).toBeGreaterThan(0);
  });

  it('can be dismissed by the screen reader escape action', () => {
    const onHide = jest.fn();
    render(wrap(<Toast message="Set removed" onHide={onHide} />));
    fireEvent(screen.UNSAFE_getByProps({ accessibilityLiveRegion: 'polite' }), 'accessibilityEscape');
    expect(onHide).toHaveBeenCalled();
  });

  it('a new message after a dismissed one shows again', () => {
    const onHide = jest.fn();
    const { rerender } = render(wrap(<Toast message="Set removed" onHide={onHide} />));
    act(() => { jest.advanceTimersByTime(8000); });
    rerender(wrap(<Toast message={null} onHide={onHide} />));
    rerender(wrap(<Toast message="Set removed" onHide={onHide} />));
    expect(screen.getByText('Set removed')).toBeTruthy();
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
