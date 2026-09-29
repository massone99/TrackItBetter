import * as Notifications from 'expo-notifications';
import { cancelRestFinishedNotification, scheduleRestFinishedNotification } from '../restNotifications';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../../../../modules/rest-timer/src', () => ({ RestTimer: { show: jest.fn(), hide: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: 'max' },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const { RestTimer } = jest.requireMock('../../../../modules/rest-timer/src');
const mocked = Notifications as jest.Mocked<typeof Notifications>;
const text = { title: 'Recupero terminato', body: 'Prossima serie', countdown: 'Recupero', channel: 'Timer recupero' };

beforeEach(() => jest.clearAllMocks());

describe('rest notifications', () => {
  it('asks for permission the first time, then shows the countdown and schedules the end alert at the exact end time', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await scheduleRestFinishedNotification(90, text);

    expect(mocked.requestPermissionsAsync).toHaveBeenCalled();
    expect(RestTimer.show).toHaveBeenCalledWith(1_090_000, 'Recupero', 'Timer recupero');
    const request = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.trigger).toMatchObject({ type: 'date', date: 1_090_000 });
    expect(request.content).toMatchObject({ title: 'Recupero terminato', sticky: false, autoDismiss: true });
  });

  it('does nothing outside the app when permission is denied for good', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await scheduleRestFinishedNotification(60, text);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(RestTimer.show).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('removes the countdown when the rest is skipped', async () => {
    await cancelRestFinishedNotification();
    expect(RestTimer.hide).toHaveBeenCalled();
  });
});
