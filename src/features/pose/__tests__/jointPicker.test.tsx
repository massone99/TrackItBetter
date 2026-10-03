import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../../shared/i18n';
import { findPosition, type JointAngleId } from '../../../domain/pose';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { JointPicker } from '../JointPicker';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const free = findPosition('free')!;

function Harness({ initial }: { initial: JointAngleId[] }) {
  const [selected, setSelected] = useState<JointAngleId[]>(initial);
  const [focused, setFocused] = useState<JointAngleId | null>(null);
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <JointPicker position={free} selected={selected} onChange={setSelected} values={{ hip: '38°', knee: '170°' }} focused={focused} onFocus={setFocused} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('JointPicker next to the frame', () => {
  it('shows the live angle of every chosen joint', () => {
    render(<Harness initial={['hip', 'knee']} />);
    expect(screen.getByLabelText(/Hip 38°|Anca 38°/)).toBeTruthy();
    expect(screen.getByLabelText(/Knee 170°|Ginocchio 170°/)).toBeTruthy();
  });

  it('adds a joint, then shows it, then removes it', () => {
    render(<Harness initial={['hip']} />);
    const knee = () => screen.getByRole('button', { name: /^(Knee|Ginocchio)/ });
    expect(knee().props.accessibilityState.selected).toBe(false);
    fireEvent.press(knee());
    expect(knee().props.accessibilityState.selected).toBe(true);
    // Adding also shows it; tapping it again removes it.
    fireEvent.press(knee());
    expect(knee().props.accessibilityState.selected).toBe(false);
  });

  it('first tap on an already chosen joint shows it instead of removing it', () => {
    render(<Harness initial={['hip', 'knee']} />);
    fireEvent.press(screen.getByRole('button', { name: /^(Hip|Anca)/ }));
    expect(screen.getByRole('button', { name: /^(Hip|Anca)/ }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: /^(Hip|Anca)/ }));
    expect(screen.getByRole('button', { name: /^(Hip|Anca)/ }).props.accessibilityState.selected).toBe(false);
  });
});
