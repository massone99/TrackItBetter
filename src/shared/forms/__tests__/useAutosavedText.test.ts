import { act, renderHook } from '@testing-library/react-native';
import { useAutosavedText } from '../useAutosavedText';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useAutosavedText', () => {
  it('saves the trimmed text once typing pauses, not on every keystroke', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() => useAutosavedText('', onSave, 700));
    act(() => result.current.change('Band '));
    act(() => { jest.advanceTimersByTime(400); });
    act(() => result.current.change('Band green '));
    act(() => { jest.advanceTimersByTime(400); });
    expect(onSave).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(300); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Band green');
  });

  it('saves at once on flush (blur) and writes nothing when the text did not change', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() => useAutosavedText('Hooks at 3', onSave));
    act(() => result.current.flush());
    expect(onSave).not.toHaveBeenCalled();
    act(() => result.current.change('Hooks at 4'));
    act(() => result.current.flush());
    expect(onSave).toHaveBeenCalledWith('Hooks at 4');
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('saves what is pending when the field goes away, and can clear the note', () => {
    const onSave = jest.fn();
    const { result, unmount } = renderHook(() => useAutosavedText('Old', onSave));
    act(() => result.current.change('   '));
    unmount();
    expect(onSave).toHaveBeenCalledWith('');
  });
});
