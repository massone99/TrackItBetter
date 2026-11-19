import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { PrimaryActionBar } from '../PrimaryActionBar';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

// React Native's test window reports a font scale of 2 (large text); `mockFontScale` sets it per test.
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

function show() {
  const onPress = jest.fn();
  const onDetails = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <PrimaryActionBar label="COMPLETE SET 3" icon="checkmark" detailsLabel="More set details" onPress={onPress} onDetails={onDetails} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onPress, onDetails };
}

describe('PrimaryActionBar', () => {
  beforeEach(() => { mockFontScale = 1; });

  it('completes the set in one tap and opens the details from the button beside it', () => {
    const { onPress, onDetails } = show();
    fireEvent.press(screen.getByLabelText('COMPLETE SET 3'));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('More set details'));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it('gives the whole row to the main action at large text', () => {
    mockFontScale = 2;
    show();
    expect(screen.queryByLabelText('More set details')).toBeNull();
    expect(screen.getByLabelText('COMPLETE SET 3')).toBeTruthy();
  });
});
