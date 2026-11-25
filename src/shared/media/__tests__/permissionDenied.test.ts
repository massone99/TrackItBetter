import { Alert, Linking } from 'react-native';
import { alertPermissionDenied } from '../permissionDenied';

const t = ((key: string) => key) as never;

describe('alertPermissionDenied', () => {
  beforeEach(() => { jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('only informs while Android can still ask', () => {
    alertPermissionDenied(t, 'Title', 'Body', { canAskAgain: true });
    expect(Alert.alert).toHaveBeenCalledWith('Title', 'Body');
  });

  it('offers the system settings once Android will not ask again', () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    alertPermissionDenied(t, 'Title', 'Body', { canAskAgain: false });
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((button) => button.text)).toEqual(['common.cancel', 'common.openSettings']);
    buttons[1].onPress?.();
    expect(open).toHaveBeenCalled();
  });
});
