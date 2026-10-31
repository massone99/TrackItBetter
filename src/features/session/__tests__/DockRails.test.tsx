import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { DockRails, WorkoutDockPanel } from '../DockRails';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const wrap = (node: React.ReactNode) => render(
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <ThemeProvider>{node}</ThemeProvider>
  </SafeAreaProvider>,
);

describe('dock rails', () => {
  it('shows each rail with its state and reports presses', () => {
    const onTelemetry = jest.fn();
    const onWorkout = jest.fn();
    wrap(<DockRails rails={[
      { id: 'telemetry', label: 'Telemetry', summary: '● Live', open: false, onPress: onTelemetry },
      { id: 'workout', label: 'Workout', summary: 'Exercise 3 of 7', open: true, onPress: onWorkout },
    ]} />);
    expect(screen.getByLabelText('Telemetry · ● Live').props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByLabelText('Workout · Exercise 3 of 7').props.accessibilityState).toMatchObject({ expanded: true });
    fireEvent.press(screen.getByLabelText('Telemetry · ● Live'));
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onWorkout).not.toHaveBeenCalled();
  });

  it('gives Add exercise and Finish workout their own buttons', () => {
    const onAdd = jest.fn();
    const onFinish = jest.fn();
    wrap(<WorkoutDockPanel title="Workout" addLabel="Add exercise" finishLabel="Finish workout" onAdd={onAdd} onFinish={onFinish} />);
    fireEvent.press(screen.getByLabelText('Add exercise'));
    fireEvent.press(screen.getByLabelText('Finish workout'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
