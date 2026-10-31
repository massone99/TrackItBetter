import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { PrimaryActionBar } from '../PrimaryActionBar';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

function show(props: Partial<Parameters<typeof PrimaryActionBar>[0]> = {}) {
  const onPress = jest.fn();
  const onLink = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <PrimaryActionBar label="COMPLETE SET 3" icon="checkmark" caption="Ratings are optional" linkLabel="More set details" onPress={onPress} onLink={onLink} {...props} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onPress, onLink };
}

describe('PrimaryActionBar', () => {
  it('completes the set in one tap and opens the details from its link', () => {
    const { onPress, onLink } = show();
    fireEvent.press(screen.getByLabelText('COMPLETE SET 3'));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('More set details'));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('drops the caption line when there is no room for it', () => {
    show({ caption: null });
    expect(screen.queryByLabelText('More set details')).toBeNull();
    expect(screen.getByLabelText('COMPLETE SET 3')).toBeTruthy();
  });
});
