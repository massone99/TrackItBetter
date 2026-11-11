import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ScaleRow } from '../ScaleRow';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function show(value: number | null, onChange = jest.fn()) {
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <ScaleRow label="RPE" values={[6, 7, 8, 9, 10]} value={value} onChange={onChange} half halfLabel="Half point" valueLabel={(v) => `RPE ${v}`} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return onChange;
}

describe('ScaleRow', () => {
  it('a tap sets a whole value, a tap on the chosen one clears it', () => {
    const onChange = show(null);
    fireEvent.press(screen.getByLabelText('RPE 8'));
    expect(onChange).toHaveBeenLastCalledWith(8);
    onChange.mockClear();
    const again = show(8);
    fireEvent.press(screen.getAllByLabelText('RPE 8').at(-1)!);
    expect(again).toHaveBeenLastCalledWith(null);
  });

  it('the half toggle moves the value half a point and back, and is off at the top or with no value', () => {
    const onChange = show(8);
    fireEvent.press(screen.getByLabelText('Half point'));
    expect(onChange).toHaveBeenLastCalledWith(8.5);

    const back = show(8.5);
    expect(screen.getAllByLabelText('RPE 8.5').length).toBeGreaterThan(0);
    fireEvent.press(screen.getAllByLabelText('Half point').at(-1)!);
    expect(back).toHaveBeenLastCalledWith(8);

    show(10);
    expect(screen.getAllByLabelText('Half point').at(-1)!.props.accessibilityState).toMatchObject({ disabled: true });
    show(null);
    expect(screen.getAllByLabelText('Half point').at(-1)!.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
