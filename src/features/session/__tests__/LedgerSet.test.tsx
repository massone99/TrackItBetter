import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { LedgerActiveRow, LedgerDoneRow, LedgerHeader, LedgerUpcomingRow, type LedgerActiveRowProps } from '../LedgerSet';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

// React Native's test window reports a font scale of 2 (large text); `mockFontScale` sets it per test.
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function wrap(node: ReactNode) {
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider>{node}</ThemeProvider></SafeAreaProvider>);
}
const noop = () => undefined;
const active = (overrides: Partial<LedgerActiveRowProps> = {}): LedgerActiveRowProps => ({
  label: '2', withLoad: true, valueField: <Text>8</Text>, valueDown: <Text>v-</Text>, valueUp: <Text>v+</Text>,
  loadField: <Text>40</Text>, loadDown: <Text>l-</Text>, loadUp: <Text>l+</Text>, onComplete: noop, ...overrides,
});

beforeAll(() => { void i18n.changeLanguage('en'); });
beforeEach(() => { mockFontScale = 1; });

describe('Ledger rows', () => {
  it('shows the column header', () => {
    wrap(<LedgerHeader valueLabel="REPS" />);
    for (const text of ['#', 'REPS', 'KG', 'DONE']) expect(screen.getByText(text)).toBeTruthy();
  });

  it('done row: tap opens, hold opens the menu, shows RPE and load', () => {
    const onOpen = jest.fn();
    const onMenu = jest.fn();
    wrap(<LedgerDoneRow label="1" value="8" rpe="8" load="40" onOpen={onOpen} onMenu={onMenu} />);
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText(' · RPE 8')).toBeTruthy();
    const row = screen.getByLabelText('Set 1: 8, 40 kg, RPE 8, done');
    fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent(row, 'longPress');
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('done row with bands shows the assistance, with a pair side and warm-up label', () => {
    wrap(<LedgerDoneRow label="W" warmup side="L" value="5" bands={{ colors: ['#2F80ED'], assist: '15' }} onOpen={noop} onMenu={noop} />);
    expect(screen.getByText('−15')).toBeTruthy();
    expect(screen.getByText('WL')).toBeTruthy();
  });

  it('upcoming row fires its callbacks', () => {
    const onOpen = jest.fn();
    const onMenu = jest.fn();
    wrap(<LedgerUpcomingRow label="3" value="8" onOpen={onOpen} onMenu={onMenu} />);
    const row = screen.getByLabelText('Set 3: 8, to do');
    fireEvent.press(row);
    fireEvent(row, 'longPress');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

describe('LedgerActiveRow', () => {
  it('lays out the slots in one row and completes with the button', () => {
    const onComplete = jest.fn();
    wrap(<LedgerActiveRow {...active({ onComplete })} />);
    for (const text of ['8', 'v-', 'v+', '40', 'l-', 'l+']) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText('Complete set')).toBeNull();
    fireEvent.press(screen.getByLabelText('Complete set'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('omits the load column and honours the complete slot', () => {
    wrap(<LedgerActiveRow {...active({ withLoad: false, completeSlot: <Text>HOLD</Text> })} />);
    expect(screen.queryByText('40')).toBeNull();
    expect(screen.getByText('HOLD')).toBeTruthy();
    expect(screen.queryByLabelText('Complete set')).toBeNull();
  });

  it('chips: empty are dashed labels, filled show their values, each fires its own press', () => {
    const rpe = jest.fn(); const bands = jest.fn(); const note = jest.fn(); const video = jest.fn(); const rest = jest.fn();
    wrap(<LedgerActiveRow {...active({
      rpe: { value: null, target: '8', onPress: rpe },
      form: { value: '4', onPress: noop },
      rom: { value: null, onPress: noop },
      bands: { colors: [], assist: null, onPress: bands },
      rest: { value: '1:30', onPress: rest },
      note: { text: null, onPress: note },
      video: { clips: 0, onPress: video },
      panel: <Text>picker</Text>,
    })} />);
    // Folded by default: no chips, the picker still shows.
    expect(screen.queryByLabelText('+ BANDS')).toBeNull();
    expect(screen.getByLabelText('DETAILS. FORM 4').props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(screen.getByLabelText('DETAILS. FORM 4'));
    expect(screen.getByLabelText('RPE @8')).toBeTruthy();
    expect(screen.getByLabelText('FORM 4')).toBeTruthy();
    expect(screen.getByLabelText('ROM')).toBeTruthy();
    expect(screen.getByText('picker')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('RPE @8'));
    fireEvent.press(screen.getByLabelText('+ BANDS'));
    fireEvent.press(screen.getByLabelText('REST 1:30'));
    fireEvent.press(screen.getByLabelText('+ NOTE'));
    fireEvent.press(screen.getByLabelText('VIDEO'));
    for (const fn of [rpe, bands, rest, note, video]) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('filled chips: RPE value, bands assistance, note text, clip count', () => {
    wrap(<LedgerActiveRow {...active({
      rpe: { value: '8', onPress: noop },
      bands: { colors: ['#2F80ED'], assist: '15', onPress: noop },
      note: { text: 'slow tempo', onPress: noop },
      video: { clips: 2, onPress: noop },
    })} />);
    fireEvent.press(screen.getByLabelText(/^DETAILS/));
    expect(screen.getByLabelText('RPE 8')).toBeTruthy();
    expect(screen.getByLabelText('−15 KG')).toBeTruthy();
    expect(screen.getByLabelText('slow tempo')).toBeTruthy();
    expect(screen.getByLabelText('2 CLIPS')).toBeTruthy();
  });

  it('stacks at large text: the complete button gets a label and its own line', () => {
    mockFontScale = 2;
    wrap(<LedgerActiveRow {...active()} />);
    expect(screen.getByText('Complete set')).toBeTruthy();
    expect(screen.getByText('Set 2')).toBeTruthy();
    for (const text of ['8', '40']) expect(screen.getByText(text)).toBeTruthy();
  });
});
