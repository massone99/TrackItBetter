import { renderHook, waitFor } from '@testing-library/react-native';
import { useSaveOnLeave } from '../useSaveOnLeave';

type Listener = (event: { preventDefault: () => void; data: { action: object } }) => void;
let listener: Listener | null = null;
const dispatch = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
}));
const mockNavigation = {
  addListener: (_name: string, callback: Listener) => { listener = callback; return () => { listener = null; }; },
  dispatch: (action: object) => dispatch(action),
};

const leave = () => {
  const preventDefault = jest.fn();
  listener?.({ preventDefault, data: { action: { type: 'GO_BACK' } } });
  return preventDefault;
};

beforeEach(() => { dispatch.mockClear(); listener = null; });

describe('useSaveOnLeave', () => {
  it('lets the screen go when nothing changed', () => {
    const save = jest.fn();
    renderHook(() => useSaveOnLeave({ dirty: false, save }));
    expect(leave()).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves valid edits, then resumes the original navigation', async () => {
    const save = jest.fn(async () => true);
    renderHook(() => useSaveOnLeave({ dirty: true, save }));
    expect(leave()).toHaveBeenCalled();
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('asks before leaving with invalid edits', async () => {
    const onInvalid = jest.fn();
    renderHook(() => useSaveOnLeave({ dirty: true, save: async () => false, onInvalid }));
    leave();
    await waitFor(() => expect(onInvalid).toHaveBeenCalled());
    expect(dispatch).not.toHaveBeenCalled();
    onInvalid.mock.calls[0][0]();
    expect(dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('drops invalid edits when there is nothing to ask', async () => {
    renderHook(() => useSaveOnLeave({ dirty: true, save: async () => false }));
    leave();
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });
});
