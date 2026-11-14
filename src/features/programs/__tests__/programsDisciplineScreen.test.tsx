import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserProgram } from '../../../domain/userProgram';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ProgramsDisciplineScreen } from '../ProgramsDisciplineScreen';

const mockPrograms: UserProgram[] = [
  {
    id: 's1',
    name: 'Barbell Strength',
    discipline: 'strength',
    updatedAt: '2026-05-01T10:00:00.000Z',
    sessions: [{ id: 'd1', name: 'Upper', exercises: [] }],
  },
  {
    id: 'm1',
    name: 'Hip Mobility Flow',
    discipline: 'mobility',
    updatedAt: '2026-05-02T10:00:00.000Z',
    sessions: [{ id: 'd2', name: 'Flow', exercises: [] }],
  },
];

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false },
    useSegments: () => ['programs'],
    useFocusEffect: (cb: () => void) => {
      useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('../userPrograms', () => ({
  listUserPrograms: jest.fn(async () => mockPrograms),
  listProgramClusters: jest.fn(async () => []),
  createProgramCluster: jest.fn(),
  deleteProgramCluster: jest.fn(),
  deleteUserProgram: jest.fn(),
  duplicateUserProgram: jest.fn(),
  renameProgramAuthor: jest.fn(),
  renameProgramCategory: jest.fn(),
  renameProgramCluster: jest.fn(),
  updateUserProgram: jest.fn(),
}));
jest.mock('../startUserSession', () => ({
  startUserProgramSession: jest.fn(async () => 'w1'),
}));
jest.mock('../hiddenTemplates', () => ({
  listHiddenTemplates: jest.fn(async () => []),
  setHiddenTemplates: jest.fn(async () => {}),
}));
jest.mock('../../session/repository', () => ({
  getActiveWorkout: jest.fn(async () => null),
  listRecentWorkoutNames: jest.fn(async () => []),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ProgramsDisciplineScreen', () => {
  it('shows only strength programs on the strength page', async () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <ProgramsDisciplineScreen discipline="strength" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(screen.getByText('Barbell Strength')).toBeTruthy());
    expect(screen.queryByText('Hip Mobility Flow')).toBeNull();
    expect(screen.getByText(i18n.t('programDiscipline.strengthPage'))).toBeTruthy();
  });

  it('shows only mobility programs on the mobility page', async () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <ProgramsDisciplineScreen discipline="mobility" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(screen.getByText('Hip Mobility Flow')).toBeTruthy());
    expect(screen.queryByText('Barbell Strength')).toBeNull();
    expect(screen.getByText(i18n.t('programDiscipline.mobilityPage'))).toBeTruthy();
  });
});
