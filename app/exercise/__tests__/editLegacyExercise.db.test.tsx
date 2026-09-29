import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../src/shared/i18n';
import { ThemeProvider } from '../../../src/shared/theme/ThemeProvider';
import { migrateDatabase } from '../../../src/db/migrations';
import { seedCatalogIfEmpty } from '../../../src/db/seed/import';
import { migrateDatabaseV5 } from '../../../src/test/fixtures/migrationsV5';
import exerciseSeed from '../../../src/db/seed/exercises.json';
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

// Catalog and custom rows as an app from before movement classification (schema v5) stored them.
function insertLegacyExercise(e: { id: string; name: string; metric: string; category: string; movementPattern?: string | null; chainId?: string | null; level?: number | null; aliases?: string[]; equipment?: string[]; cues?: string[]; primaryMuscles?: string[] }, custom: boolean) {
  real.sqlite.prepare(`INSERT INTO exercise (id, name, aliases, metric, category, movement_pattern, primary_muscles, secondary_muscles, equipment, unilateral, chain_id, level, leverage_factor, cues, demo_url, is_custom, favourite, archived, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 0, ?, ?, NULL, ?, NULL, ?, 0, 0, ?)`).run(
    e.id, e.name, JSON.stringify(e.aliases ?? []), e.metric, e.category, e.movementPattern ?? null, JSON.stringify(e.primaryMuscles ?? []),
    JSON.stringify(e.equipment ?? []), e.chainId ?? null, e.level ?? null, JSON.stringify(e.cues ?? []), custom ? 1 : 0, Date.now(),
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
  await migrateDatabaseV5(real.expo);
  const chains = jest.requireActual('../../../src/db/seed/progression-chains.json') as { id: string; name: string; description: string; family: string }[];
  for (const chain of chains) real.sqlite.prepare('INSERT INTO progression_chain (id, name, description, family) VALUES (?, ?, ?, ?)').run(chain.id, chain.name, chain.description, chain.family);
  for (const exercise of exerciseSeed) insertLegacyExercise(exercise, false);
  // Custom exercises as imported from a hand-made backup.
  insertLegacyExercise({ id: 'oblique-hanging-raise', name: 'Oblique Hanging Raise', metric: 'reps', category: 'core', movementPattern: 'trunk-flexion', equipment: ['bar'] }, true);
  insertLegacyExercise({ id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', metric: 'reps_load', category: 'push', movementPattern: 'vertical-push', equipment: ['dumbbell'] }, true);
  insertLegacyExercise({ id: 'tuck-planche-lift-off', name: 'Tuck Planche Lift-off', metric: 'reps', category: 'skill', equipment: ['floor', 'band'] }, true);
  // The current app then opens the same database.
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

describe('editing exercises in a database carried over from an older app version', () => {
  it('saves every exercise unchanged', async () => {
    const ids = (real.sqlite.prepare('SELECT id FROM exercise').all() as { id: string }[]).map(({ id }) => id);
    const failures: string[] = [];
    for (const id of ids) {
      (goBack as jest.Mock).mockClear();
      mockParams.edit = id;
      const view = renderForm();
      await screen.findByDisplayValue(row(id).name as string);
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

  it('saves an added category on a custom exercise imported from a backup', async () => {
    (goBack as jest.Mock).mockClear();
    mockParams.edit = 'tuck-planche-lift-off';
    renderForm();
    await screen.findByDisplayValue('Tuck Planche Lift-off');
    fireEvent.press(extraChip('library.category.push'));
    fireEvent.press(screen.getByRole('button', { name: t('common.save') }));
    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(row('tuck-planche-lift-off')).toMatchObject({ category: 'skill', extra_categories: '["push"]' });
  });
});
