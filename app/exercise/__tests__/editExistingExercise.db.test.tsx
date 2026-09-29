import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../src/shared/i18n';
import { ThemeProvider } from '../../../src/shared/theme/ThemeProvider';
import { migrateDatabase } from '../../../src/db/migrations';
import { seedCatalogIfEmpty } from '../../../src/db/seed/import';
import NewExerciseRoute from '../new';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('../../../src/db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../src/test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
const mockParams: { edit?: string } = {};
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useSegments: () => ['exercise'],
}));
jest.mock('../../../src/shared/navigation/goBack', () => ({ goBack: jest.fn() }));

const { mockReal: real } = jest.requireMock('../../../src/db/client');
const { goBack } = jest.requireMock('../../../src/shared/navigation/goBack');
const t = (key: string) => i18n.t(key);
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderForm = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><NewExerciseRoute /></ThemeProvider></SafeAreaProvider>);
const row = (id: string) => real.sqlite.prepare('SELECT * FROM exercise WHERE id = ?').get(id) as Record<string, unknown>;
const extraChip = (key: string) => screen.getByRole('button', { name: `${t('customExercise.extraCategories')}: ${t(key)}` });

beforeAll(async () => {
  await i18n.changeLanguage('en');
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

describe('editing an exercise that already exists in the database', () => {
  it('saves extra categories and classification on a catalog exercise', async () => {
    mockParams.edit = 'tuck-planche';
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.press(extraChip('library.category.core'));
    fireEvent.press(screen.getAllByRole('button', { name: t('movement.groups.vertical-push') })[0]);
    fireEvent.changeText(screen.getByLabelText(t('movement.searchTags')), 'shoulder fl');
    fireEvent.press(screen.getByRole('button', { name: 'Shoulder flexion' }));
    fireEvent.press(screen.getByRole('button', { name: t('common.save') }));

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(screen.queryByText(t('customExercise.errors.save'))).toBeNull();
    expect(row('tuck-planche')).toMatchObject({
      name: 'Tuck Planche',
      category: 'skill',
      extra_categories: '["push","core"]',
      movement_group: 'vertical-push',
      movement_tag: 'Shoulder flexion',
    });
  });

  it('saves every catalog exercise unchanged', async () => {
    const ids = (real.sqlite.prepare('SELECT id FROM exercise').all() as { id: string }[]).map(({ id }) => id);
    const failures: string[] = [];
    for (const id of ids) {
      (goBack as jest.Mock).mockClear();
      mockParams.edit = id;
      const view = renderForm();
      const name = row(id).name as string;
      await screen.findByDisplayValue(name);
      fireEvent.press(screen.getByRole('button', { name: t('common.save') }));
      try {
        await waitFor(() => expect(goBack).toHaveBeenCalled());
      } catch {
        failures.push(id);
      }
      view.unmount();
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
