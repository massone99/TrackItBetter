import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserProgram } from '../../../../domain/userProgram';
import i18n from '../../../../shared/i18n';
import { ThemeProvider } from '../../../../shared/theme/ThemeProvider';
import { ProgramsView } from '../ProgramsView';

jest.mock('../../../../shared/settings/preferences', () => {
  const store = new Map<string, string>();
  return {
    ...jest.requireActual('../../../../shared/settings/preferences'),
    readPreference: (key: string) => store.get(key) ?? null,
    writePreference: (key: string, value: string) => { store.set(key, value); },
    readBooleanPreference: (key: string, fallback: boolean) => {
      const val = store.get(key);
      return val === undefined ? fallback : val === 'true';
    },
    __resetMockPrefs: () => store.clear(),
  };
});
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../userPrograms', () => ({
  createProgramCluster: jest.fn(),
  deleteProgramCluster: jest.fn(),
  deleteUserProgram: jest.fn(),
  duplicateUserProgram: jest.fn(),
  renameProgramAuthor: jest.fn(),
  renameProgramCategory: jest.fn(),
  renameProgramCluster: jest.fn(),
  updateUserProgram: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const samplePrograms: UserProgram[] = [
  {
    id: 'p1',
    name: 'Strength Alpha',
    category: 'Strength',
    author: 'Coach A',
    clusters: ['bands programs'],
    updatedAt: '2026-05-01T10:00:00.000Z',
    lastUsedAt: '2026-05-03T10:00:00.000Z',
    sessions: [{ id: 's1', name: 'Day 1', exercises: [] }, { id: 's2', name: 'Day 2', exercises: [] }],
  },
  {
    id: 'p2',
    name: 'Mobility Flow',
    category: 'Mobility',
    author: 'Tom Merrick',
    updatedAt: '2026-05-02T10:00:00.000Z',
    lastUsedAt: '2026-05-01T10:00:00.000Z',
    sessions: [{ id: 's3', name: 'Flow', exercises: [] }],
  },
];

const renderView = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <ProgramsView
          programs={samplePrograms}
          recentNames={[]}
          starting={false}
          onStartHero={jest.fn()}
          onChanged={jest.fn()}
          onNotice={jest.fn()}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const { __resetMockPrefs } = jest.requireMock('../../../../shared/settings/preferences');

beforeEach(() => {
  __resetMockPrefs();
});

describe('ProgramsView filters, sorting, and barebone mode', () => {
  it('opens collapsible filters and filters programs by author', () => {
    renderView();
    expect(screen.queryByText('Tom Merrick')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: t('programsList.filters') }));
    fireEvent.press(screen.getByRole('button', { name: 'Tom Merrick' }));
    expect(screen.getByText('Mobility Flow')).toBeTruthy();
    expect(screen.queryByText(/Coach A ·/)).toBeNull();
    expect(screen.queryByText('Strength Alpha')).toBeNull();
  });

  it('opens sort sheet and applies a chosen sort option', () => {
    renderView();
    const sortBtn = screen.getByRole('button', { name: `${t('programsList.sort')}: ${t('programsList.sortOptions.recent')}` });
    fireEvent.press(sortBtn);
    fireEvent.press(screen.getByRole('button', { name: t('programsList.sortOptions.nameAsc') }));
    expect(screen.getByRole('button', { name: `${t('programsList.sort')}: ${t('programsList.sortOptions.nameAsc')}` })).toBeTruthy();
  });

  it('toggles barebone names-only mode hiding hero, tags, and metadata', () => {
    renderView();
    expect(screen.getByText(t('programsList.inProgress'))).toBeTruthy();
    expect(screen.getAllByText('Strength').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByRole('button', { name: t('programsList.barebone') }));

    expect(screen.queryByText(t('programsList.inProgress'))).toBeNull();
    expect(screen.queryByText('Strength')).toBeNull();
    expect(screen.getByText('Strength Alpha')).toBeTruthy();
    expect(screen.getByText('Mobility Flow')).toBeTruthy();
  });

  it('filters by custom cluster and toggles group-by-cluster view', () => {
    renderView();
    fireEvent.press(screen.getByRole('button', { name: t('programsList.filters') }));
    fireEvent.press(screen.getAllByRole('button', { name: 'bands programs' })[0]);
    expect(screen.getByText('Strength Alpha')).toBeTruthy();
    expect(screen.queryByText('Mobility Flow')).toBeNull();

    // Clear filter and switch to By cluster view
    fireEvent.press(screen.getAllByRole('button', { name: 'bands programs' })[0]);
    fireEvent.press(screen.getByRole('button', { name: t('programCluster.groupView') }));
    expect(screen.getByText('bands programs (1)')).toBeTruthy();
    expect(screen.getByText(`${t('programCluster.unclustered')} (1)`)).toBeTruthy();
  });
});
