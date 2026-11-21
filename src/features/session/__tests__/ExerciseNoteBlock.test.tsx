import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ExerciseNoteBlock } from '../ExerciseNoteBlock';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string) => String(i18n.t(key));
const renderBlock = (props: { note: string | null; collapsed?: boolean; onSave?: (note: string) => void }) =>
  render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ExerciseNoteBlock note={props.note} collapsed={props.collapsed ?? false} onSave={props.onSave} /></ThemeProvider></SafeAreaProvider>);

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ExerciseNoteBlock', () => {
  it('shows the note on the card and edits it in place with one tap, saving by itself', () => {
    const onSave = jest.fn();
    renderBlock({ note: 'Green band', onSave });
    expect(screen.getByText('Green band')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: new RegExp(t('logger.exerciseNoteLabel')) }));
    const field = screen.getByLabelText(t('logger.exerciseNoteLabel'));
    fireEvent.changeText(field, 'Green band, hooks at 3');
    expect(onSave).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(800); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Green band, hooks at 3');
  });

  it('saves on blur at once and goes back to showing the note', () => {
    const onSave = jest.fn();
    renderBlock({ note: 'Old', onSave });
    fireEvent.press(screen.getByRole('button', { name: new RegExp(t('logger.exerciseNoteLabel')) }));
    const field = screen.getByLabelText(t('logger.exerciseNoteLabel'));
    fireEvent.changeText(field, 'New');
    fireEvent(field, 'blur');
    expect(onSave).toHaveBeenCalledWith('New');
    expect(screen.queryByLabelText(t('logger.exerciseNoteLabel'))).toBeNull();
  });

  it('offers an "Add note" row when there is no note, but not on a folded card', () => {
    const onSave = jest.fn();
    const { unmount } = renderBlock({ note: null, onSave });
    expect(screen.getByRole('button', { name: t('logger.addExerciseNote') })).toBeTruthy();
    unmount();
    renderBlock({ note: null, collapsed: true, onSave });
    expect(screen.queryByRole('button', { name: t('logger.addExerciseNote') })).toBeNull();
  });

  it('keeps a one-line preview on a folded card and is read-only without onSave', () => {
    renderBlock({ note: 'Line one\nLine two', collapsed: true, onSave: jest.fn() });
    expect(screen.getByText('Line one\nLine two').props.numberOfLines).toBe(1);
  });

  it('only shows the note when it cannot be saved', () => {
    renderBlock({ note: 'Read only' });
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
