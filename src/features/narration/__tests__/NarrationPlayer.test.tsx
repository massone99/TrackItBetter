import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { playBeep } from '../../../shared/audio/beeps';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { NarrationPlayer } from '../NarrationPlayer';

jest.mock('../../exercises/ReferenceLinkSheet', () => ({ openReferenceVideo: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-speech', () => ({ stop: jest.fn(async () => {}), speak: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('../../../shared/audio/beeps', () => ({ playBeep: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function show(workVoice: boolean) {
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <NarrationPlayer title="Session" draftKey="test.narration" exitHref="/" onSave={jest.fn()}
          drills={[{ name: 'Plank', cue: null, demoUrl: null, rounds: 1 }]}
          prepVoice={false} workVoice={workVoice}
          segments={[{ kind: 'prep', stepIndex: 0, durationSec: 2 },
            { kind: 'work', stepIndex: 0, durationSec: 8, mode: 'hold', round: 1, side: null, reps: null }]} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(() => { void i18n.changeLanguage('en'); });
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

it.each([true, false])('starts after the beep-only preparation, with work speech %s', async (workVoice) => {
  show(workVoice);
  expect(playBeep).toHaveBeenCalledWith('tick');
  expect(Speech.speak).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(screen.getByText('Hold')).toBeTruthy();
  expect(playBeep).toHaveBeenCalledWith('go');
  if (workVoice) expect(Speech.speak).toHaveBeenCalledWith('Plank', expect.anything());
  else expect(Speech.speak).not.toHaveBeenCalled();
});

it('waits for confirmation before resting and records the edited reps', async () => {
  const onSegmentDone = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <NarrationPlayer title="Session" draftKey="test.timed.reps" exitHref="/" onSave={jest.fn()}
          drills={[{ name: 'Pull-up', cue: null, demoUrl: null, rounds: 2 }]}
          initialVoice={false} editablePrescription onSegmentDone={onSegmentDone}
          segments={[
            { kind: 'work', stepIndex: 0, mode: 'reps', durationSec: null, round: 1, side: null, reps: 3 },
            { kind: 'rest', stepIndex: 0, durationSec: 10, brief: true },
            { kind: 'work', stepIndex: 0, mode: 'reps', durationSec: null, round: 2, side: null, reps: 3 },
          ]} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(screen.getByText('3 reps')).toBeTruthy();
  expect(onSegmentDone).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Edit prescription'));
  fireEvent.press(screen.getByLabelText('Reps +'));
  fireEvent.press(screen.getAllByLabelText('Close')[0]);
  expect(screen.getByText('4 reps')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Done'));
  expect(onSegmentDone).toHaveBeenCalledWith(expect.objectContaining({ reps: 4 }));
  expect(screen.getByText('Rest')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(screen.getByText('3 reps')).toBeTruthy();
});
