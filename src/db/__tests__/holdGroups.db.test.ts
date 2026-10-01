import exerciseSeed from '../seed/exercises.json';
import progressionChains from '../seed/progression-chains.json';
import { migrateDatabase } from '../migrations';
import { migrateDatabaseV5 } from '../../test/fixtures/migrationsV5';
import { migrateDatabaseV7 } from '../../test/fixtures/migrationsV7';
import { createRealDatabase } from '../../test/realDatabase';

type Row = { id: string; movement_group: string | null; extra_categories: string };

/** A database as the app wrote it before movement groups (schema v5), with the catalog and a custom exercise. */
function legacyDatabase() {
  const real = createRealDatabase();
  return { real, ready: (async () => {
    await migrateDatabaseV5(real.expo);
    for (const chain of progressionChains) real.sqlite.prepare('INSERT INTO progression_chain (id, name, description, family) VALUES (?, ?, ?, ?)').run(chain.id, chain.name, chain.description, chain.family);
    const insert = real.sqlite.prepare(`INSERT INTO exercise (id, name, aliases, metric, category, movement_pattern, primary_muscles, secondary_muscles, equipment, unilateral, chain_id, level, leverage_factor, cues, demo_url, is_custom, favourite, archived, created_at)
      VALUES (?, ?, '[]', ?, ?, ?, '[]', '[]', '[]', 0, ?, ?, NULL, '[]', NULL, ?, 0, 0, ?)`);
    for (const e of exerciseSeed) insert.run(e.id, e.name, e.metric, e.category, e.movementPattern ?? null, e.chainId ?? null, e.level ?? null, 0, Date.now());
    insert.run('my-handstand', 'My handstand', 'time', 'skill', 'inversion', null, null, 1, Date.now());
  })() };
}
const row = (real: ReturnType<typeof createRealDatabase>, id: string) => real.sqlite.prepare('SELECT id, movement_group, extra_categories FROM exercise WHERE id = ?').get(id) as unknown as Row;

describe('hold groups migration', () => {
  it('puts catalog handstands, support holds and back levers under the push or pull they train', async () => {
    const { real, ready } = legacyDatabase();
    await ready;
    await migrateDatabase(real.expo);
    expect(row(real, 'freestanding-handstand-hold')).toMatchObject({ movement_group: 'vertical-push', extra_categories: '["push"]' });
    expect(row(real, 'v-sit')).toMatchObject({ movement_group: 'vertical-push', extra_categories: '["push"]' });
    expect(row(real, 'tuck-back-lever')).toMatchObject({ movement_group: 'horizontal-pull', extra_categories: '["pull"]' });
    // Already handled by earlier migrations, or deliberately left without a group.
    expect(row(real, 'tuck-planche')).toMatchObject({ movement_group: 'horizontal-push', extra_categories: '["push"]' });
    expect(row(real, 'full-human-flag')).toMatchObject({ movement_group: null, extra_categories: '[]' });
    expect(row(real, 'plank')).toMatchObject({ movement_group: null, extra_categories: '[]' });
  });

  it('leaves the user\'s own exercises alone', async () => {
    const { real, ready } = legacyDatabase();
    await ready;
    await migrateDatabase(real.expo);
    expect(row(real, 'my-handstand')).toMatchObject({ movement_group: null, extra_categories: '[]' });
  });

  it('runs once: later edits by the user survive the next start', async () => {
    const { real, ready } = legacyDatabase();
    await ready;
    await migrateDatabase(real.expo);
    real.sqlite.exec(`UPDATE exercise SET movement_group = NULL, extra_categories = '["core"]' WHERE id = 'freestanding-handstand-hold'`);
    await migrateDatabase(real.expo);
    expect(row(real, 'freestanding-handstand-hold')).toMatchObject({ movement_group: null, extra_categories: '["core"]' });
  });

  it('does not overwrite an exercise the user classified before the update', async () => {
    const { real, ready } = legacyDatabase();
    await ready;
    // A real v7 database whose user already filed a catalog handstand under core.
    await migrateDatabaseV7(real.expo);
    real.sqlite.exec(`UPDATE exercise SET movement_group = NULL, extra_categories = '["core"]' WHERE id = 'pike-handstand-hold'; UPDATE exercise SET movement_group = NULL, extra_categories = '[]' WHERE id = 'wall-facing-handstand-hold'`);
    await migrateDatabase(real.expo);
    expect(row(real, 'pike-handstand-hold')).toMatchObject({ movement_group: null, extra_categories: '["core"]' });
    expect(row(real, 'wall-facing-handstand-hold')).toMatchObject({ movement_group: 'vertical-push', extra_categories: '["push"]' });
  });
});
