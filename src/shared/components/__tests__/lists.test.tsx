import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../i18n';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ListGroup, ListRow, Sheet } from '../ui';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useSegments: () => ['x'] }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider>{ui}</ThemeProvider></SafeAreaProvider>);
const dividers = () => screen.UNSAFE_getAllByType(View).filter((view) => StyleSheet.flatten(view.props.style)?.borderTopWidth != null);

beforeAll(async () => { await i18n.changeLanguage('en'); });

describe('ListGroup', () => {
  it('separates every row, including rows passed as an array', () => {
    wrap(
      <ListGroup>
        <ListRow title="Clear" onPress={() => undefined} />
        {['A', 'B', 'C'].map((name) => <ListRow key={name} title={name} onPress={() => undefined} />)}
        {false}
      </ListGroup>,
    );
    expect(dividers()).toHaveLength(3);
  });

  it('still works with a single row', () => {
    wrap(<ListGroup><ListRow title="Only" /></ListGroup>);
    expect(dividers()).toHaveLength(0);
    expect(screen.getByText('Only')).toBeTruthy();
  });
});

describe('ListRow', () => {
  it('marks the selected row for sight and for screen readers', () => {
    wrap(
      <ListGroup>
        <ListRow title="Push" selected onPress={() => undefined} />
        <ListRow title="Pull" onPress={() => undefined} />
      </ListGroup>,
    );
    expect(screen.getByRole('button', { name: /Push/ }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: /Pull/ }).props.accessibilityState).not.toMatchObject({ selected: true });
  });
});

describe('Sheet', () => {
  it('does not nest its content inside the close button', () => {
    const onClose = jest.fn();
    wrap(<Sheet visible onClose={onClose} title="Category"><ListRow title="Push" onPress={() => undefined} /></Sheet>);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(within(close).queryByRole('button', { name: /Push/ })).toBeNull();
    expect(within(close).queryByText('Category')).toBeNull();
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps taps on its content from closing it', () => {
    const onClose = jest.fn();
    const onPress = jest.fn();
    wrap(<Sheet visible onClose={onClose} title="Category"><ListRow title="Push" onPress={onPress} /></Sheet>);
    fireEvent.press(screen.getByText('Push'));
    expect(onPress).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
