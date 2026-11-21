/**
 * Every route of `app/`, checked by the UI layout audit (`npm run ui:audit`). Screens get `empty`, `default`
 * and `long_text` states on a real in-memory database (see `extractSnapshots.audit.tsx`); add a
 * screen here when you create one, and give key controls a `testID`.
 */
import type { ReactElement } from 'react';
import i18n from '../shared/i18n';
import { ThemeProvider } from '../shared/theme/ThemeProvider';
import { AnimationProvider } from '../shared/settings/AnimationProvider';
import { migrateDatabase } from '../db/migrations';
import { seedCatalogIfEmpty } from '../db/seed/import';
import { bumpFinishedVersion } from '../db/cache';
import { seed } from '../dev/webSeed';
import LogScreen from '../../app/(tabs)/log';
import ProfileScreen from '../../app/(tabs)/profile';
import ProgramsScreen from '../../app/(tabs)/programs';
import ProgressScreen from '../../app/(tabs)/progress';
import TodayScreen from '../../app/(tabs)/today';
import BandOrderScreen from '../../app/band-order';
import BandSetIdScreen from '../../app/band-set/[id]';
import BodyweightScreen from '../../app/bodyweight';
import ChainIdScreen from '../../app/chain/[id]';
import DailyGoalIdScreen from '../../app/daily-goal/[id]';
import DailyGoalsScreen from '../../app/daily-goals';
import DataScreen from '../../app/data';
import EquipmentScreen from '../../app/equipment';
import EstimatorScreen from '../../app/estimator';
import ExerciseIdScreen from '../../app/exercise/[id]';
import ExerciseHistoryIdScreen from '../../app/exercise/history/[id]';
import ExerciseNewScreen from '../../app/exercise/new';
import FormCheckSetidScreen from '../../app/form-check/[setId]';
import GoalsHistoryScreen from '../../app/goals-history';
import GoalsScreen from '../../app/goals';
import ImportJsonScreen from '../../app/import-json';
import MeasurementsScreen from '../../app/measurements';
import MicroSessionScreen from '../../app/micro-session';
import MobilityImportScreen from '../../app/mobility/import';
import MobilityScreen from '../../app/mobility/index';
import MobilityPlayIdScreen from '../../app/mobility/play/[id]';
import MobilityRoutineIdScreen from '../../app/mobility/routine/[id]';
import MobilityTestsScreen from '../../app/mobility/tests';
import PhotosScreen from '../../app/photos';
import PosePositionidScreen from '../../app/pose/[positionId]';
import PoseScreen from '../../app/pose/index';
import PoseNewScreen from '../../app/pose/new';
import ProgramBuilderScreen from '../../app/program-builder';
import ProgramWorkoutScreen from '../../app/program-workout';
import ProgramIdScreen from '../../app/program/[id]';
import ProgramUserIdScreen from '../../app/program/user/[id]';
import ProgramsMobilityScreen from '../../app/programs/mobility';
import ProgramsStrengthScreen from '../../app/programs/strength';
import ProgressionsScreen from '../../app/progressions';
import RemindersScreen from '../../app/reminders';
import ResetScreen from '../../app/reset';
import SkillChainidScreen from '../../app/skill/[chainId]';
import StatsScreen from '../../app/stats';
import TrainingStatsScreen from '../../app/training-stats';
import WeeklyGoalIdScreen from '../../app/weekly-goal/[id]';
import WeeklyGoalsScreen from '../../app/weekly-goals';
import WorkoutIdScreen from '../../app/workout/[id]';
import WorkoutEntryEntryidScreen from '../../app/workout/entry/[entryId]';
import WorkoutHistoryIdScreen from '../../app/workout/history/[id]';
import WorkoutNarrateIdScreen from '../../app/workout/narrate/[id]';
import WorkoutRecapIdScreen from '../../app/workout/recap/[id]';
import WorkoutShareIdScreen from '../../app/workout/share/[id]';
import WorkoutSummaryIdScreen from '../../app/workout/summary/[id]';
import type { AuditScreenDefinition, AuditScreenStateFixture } from '../../tools/ui-audit/adapters/react-native/types';
import { auditRuntimeState } from '../../tools/ui-audit/adapters/react-native/harness';
import { listUserPrograms } from '../features/programs/userPrograms';
import { saveBandSet, newBand } from '../features/equipment/repository';
import { goalsOf } from '../features/dailyGoals/repository';
import { newStep, saveMobilityRoutine } from '../features/mobility/routines';

type Real = { sqlite: { exec: (sql: string) => void; prepare: (sql: string) => { all: () => unknown[]; run: (...args: unknown[]) => void } }; db: never; expo: never };
const real = (): Real => (jest.requireMock('../db/client') as { mockReal: Real }).mockReal;

let migrated = false;

/** Empties the database (keeping the schema) and loads the exercise catalog again. */
export async function resetDatabase(): Promise<void> {
  const { sqlite, db, expo } = real();
  if (!migrated) {
    await migrateDatabase(expo);
    migrated = true;
  }
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[];
  sqlite.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) sqlite.exec(`DELETE FROM "${name}"`);
  sqlite.exec('PRAGMA foreign_keys = ON');
  await seedCatalogIfEmpty(db);
  bumpFinishedVersion();
}

const LONG = 'Allenamento completo di forza e mobilità per tutto il corpo con progressioni avanzate';
/** Names stored by the app are capped at 60 characters. */
const LONG_NAME = LONG.slice(0, 60);

/** The owner uses the app in Italian, whose labels are the longest. */
async function prepare(workouts: number, active: boolean, long = false) {
  await i18n.changeLanguage('it');
  await resetDatabase();
  if (workouts > 0) await seed(workouts, active);
  if (long) {
    const { sqlite } = real();
    sqlite.prepare('UPDATE workout SET name = ?').run(LONG);
    sqlite.prepare("UPDATE exercise SET name = name || ' con presa prona larga e fermo isometrico'").run();
  }
  bumpFinishedVersion();
}

/** Ids of the seeded rows, for screens that open one item. */
type Ids = { finished: string; finishedSet: string; active: string; finishedEntry: string; program: string; session: string; chain: string; exercise: string; bandSet: string; dailyGoal: string; weeklyGoal: string; routine: string };
let ids: Ids | null = null;

async function collectIds(long: boolean): Promise<Ids> {
  const { sqlite } = real();
  const one = (sql: string) => (sqlite.prepare(sql).all()[0] ?? {}) as Record<string, string>;
  const finished = one('SELECT id FROM workout WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 1').id;
  const active = one('SELECT id FROM workout WHERE ended_at IS NULL LIMIT 1').id;
  const [program] = await listUserPrograms();
  const band = await saveBandSet({ name: long ? LONG_NAME : 'Elastici', bands: [newBand('Rosso', '#d33'), newBand('Nero', '#222'), newBand('Viola', '#639')] });
  const daily = await goalsOf('day').put({ scope: 'category', key: 'push', measure: 'reps', target: 50 });
  const weekly = await goalsOf('week').put({ scope: 'category', key: 'pull', measure: 'reps', target: 200 });
  const mobility = one("SELECT id FROM exercise WHERE metric = 'time' ORDER BY name LIMIT 3");
  const routine = await saveMobilityRoutine({ name: long ? LONG_NAME : 'Mobilità mattina', transitionSec: 10, prepSec: 5, steps: [newStep(mobility.id, 'hold'), newStep('pull-up', 'reps')] });
  return {
    finished,
    finishedSet: one(`SELECT s.id FROM training_set s JOIN exercise_entry e ON e.id = s.entry_id WHERE e.workout_id = '${finished}' LIMIT 1`).id,
    active,
    finishedEntry: one(`SELECT id FROM exercise_entry WHERE workout_id = '${finished}' ORDER BY "order" LIMIT 1`).id,
    program: program.id,
    session: program.sessions[0].id,
    chain: one('SELECT chain_id FROM chain_step GROUP BY chain_id ORDER BY COUNT(*) DESC LIMIT 1').chain_id,
    exercise: one(`SELECT exercise_id FROM exercise_entry WHERE workout_id = '${finished}' ORDER BY "order" LIMIT 1`).exercise_id,
    bandSet: band.id,
    dailyGoal: daily.id,
    weeklyGoal: weekly.id,
    routine: routine.id,
  };
}

let current = '';

/** Seeds the data of a state once and reuses it for the next screens that ask for the same data. */
async function ensure(kind: 'empty' | 'default' | 'long_text') {
  if (current === kind) return;
  if (kind === 'empty') await prepare(0, false);
  else {
    await prepare(6, true, kind === 'long_text');
    ids = await collectIds(kind === 'long_text');
  }
  current = kind;
}

const states: Record<string, AuditScreenStateFixture> = {
  empty: { setup: () => ensure('empty') },
  default: { setup: () => ensure('default') },
  long_text: { setup: () => ensure('long_text') },
};

/** States for a screen that opens one item: its params come from the seeded ids (no empty state). */
function withParams(params: (ids: Ids) => Record<string, unknown>): Record<string, AuditScreenStateFixture> {
  const state = (kind: 'default' | 'long_text'): AuditScreenStateFixture => ({
    setup: async () => {
      await ensure(kind);
      auditRuntimeState.routeParams = params(ids as Ids);
    },
  });
  return { default: state('default'), long_text: state('long_text') };
}

const wrap = (screen: ReactElement) => (
  <ThemeProvider>
    <AnimationProvider>{screen}</AnimationProvider>
  </ThemeProvider>
);

export const uiAuditRegistry: AuditScreenDefinition[] = [
  { id: 'log', render: () => wrap(<LogScreen />), states },
  { id: 'profile', render: () => wrap(<ProfileScreen />), states },
  { id: 'programs', render: () => wrap(<ProgramsScreen />), states },
  { id: 'progress', render: () => wrap(<ProgressScreen />), states },
  { id: 'today', render: () => wrap(<TodayScreen />), states },
  { id: 'band-order', render: () => wrap(<BandOrderScreen />), states },
  { id: 'band-set-id', render: () => wrap(<BandSetIdScreen />), states: withParams((ids) => ({ id: ids.bandSet })) },
  { id: 'bodyweight', render: () => wrap(<BodyweightScreen />), states },
  { id: 'chain-id', render: () => wrap(<ChainIdScreen />), states: withParams((ids) => ({ id: ids.chain })) },
  { id: 'daily-goal-id', render: () => wrap(<DailyGoalIdScreen />), states: withParams((ids) => ({ id: ids.dailyGoal })) },
  { id: 'daily-goals', render: () => wrap(<DailyGoalsScreen />), states },
  { id: 'data', render: () => wrap(<DataScreen />), states },
  { id: 'equipment', render: () => wrap(<EquipmentScreen />), states },
  { id: 'estimator', render: () => wrap(<EstimatorScreen />), states },
  { id: 'exercise-id', render: () => wrap(<ExerciseIdScreen />), states: withParams((ids) => ({ id: ids.exercise })) },
  { id: 'exercise-history-id', render: () => wrap(<ExerciseHistoryIdScreen />), states: withParams((ids) => ({ id: ids.exercise })) },
  { id: 'exercise-new', render: () => wrap(<ExerciseNewScreen />), states },
  { id: 'form-check-setId', render: () => wrap(<FormCheckSetidScreen />), states: withParams((ids) => ({ setId: ids.finishedSet })) },
  { id: 'goals-history', render: () => wrap(<GoalsHistoryScreen />), states: withParams((ids) => ({ period: 'day' })) },
  { id: 'goals', render: () => wrap(<GoalsScreen />), states },
  { id: 'import-json', render: () => wrap(<ImportJsonScreen />), states },
  { id: 'measurements', render: () => wrap(<MeasurementsScreen />), states },
  { id: 'micro-session', render: () => wrap(<MicroSessionScreen />), states },
  { id: 'mobility-import', render: () => wrap(<MobilityImportScreen />), states },
  { id: 'mobility', render: () => wrap(<MobilityScreen />), states },
  { id: 'mobility-play-id', render: () => wrap(<MobilityPlayIdScreen />), states: withParams((ids) => ({ id: ids.routine })) },
  { id: 'mobility-routine-id', render: () => wrap(<MobilityRoutineIdScreen />), states: withParams((ids) => ({ id: ids.routine })) },
  { id: 'mobility-tests', render: () => wrap(<MobilityTestsScreen />), states },
  { id: 'photos', render: () => wrap(<PhotosScreen />), states },
  { id: 'pose-positionId', render: () => wrap(<PosePositionidScreen />), states: withParams((ids) => ({ positionId: 'free' })) },
  { id: 'pose', render: () => wrap(<PoseScreen />), states },
  { id: 'pose-new', render: () => wrap(<PoseNewScreen />), states },
  { id: 'program-builder', render: () => wrap(<ProgramBuilderScreen />), states: withParams((ids) => ({ id: ids.program })) },
  { id: 'program-workout', render: () => wrap(<ProgramWorkoutScreen />), states: withParams((ids) => ({ programId: ids.program, sessionId: ids.session })) },
  { id: 'program-id', render: () => wrap(<ProgramIdScreen />), states: withParams((ids) => ({ id: 'beginner-full-body' })) },
  { id: 'program-user-id', render: () => wrap(<ProgramUserIdScreen />), states: withParams((ids) => ({ id: ids.program })) },
  { id: 'programs-mobility', render: () => wrap(<ProgramsMobilityScreen />), states },
  { id: 'programs-strength', render: () => wrap(<ProgramsStrengthScreen />), states },
  { id: 'progressions', render: () => wrap(<ProgressionsScreen />), states },
  { id: 'reminders', render: () => wrap(<RemindersScreen />), states },
  { id: 'reset', render: () => wrap(<ResetScreen />), states },
  { id: 'skill-chainId', render: () => wrap(<SkillChainidScreen />), states: withParams((ids) => ({ chainId: ids.chain })) },
  { id: 'stats', render: () => wrap(<StatsScreen />), states },
  { id: 'training-stats', render: () => wrap(<TrainingStatsScreen />), states },
  { id: 'weekly-goal-id', render: () => wrap(<WeeklyGoalIdScreen />), states: withParams((ids) => ({ id: ids.weeklyGoal })) },
  { id: 'weekly-goals', render: () => wrap(<WeeklyGoalsScreen />), states },
  { id: 'workout-id', render: () => wrap(<WorkoutIdScreen />), states: withParams((ids) => ({ id: ids.active })) },
  { id: 'workout-entry-entryId', render: () => wrap(<WorkoutEntryEntryidScreen />), states: withParams((ids) => ({ entryId: ids.finishedEntry, workout: ids.finished })) },
  { id: 'workout-history-id', render: () => wrap(<WorkoutHistoryIdScreen />), states: withParams((ids) => ({ id: ids.finished })) },
  { id: 'workout-narrate-id', render: () => wrap(<WorkoutNarrateIdScreen />), states: withParams((ids) => ({ id: ids.active })) },
  { id: 'workout-recap-id', render: () => wrap(<WorkoutRecapIdScreen />), states: withParams((ids) => ({ id: ids.finished })) },
  { id: 'workout-share-id', render: () => wrap(<WorkoutShareIdScreen />), states: withParams((ids) => ({ id: ids.finished })) },
  { id: 'workout-summary-id', render: () => wrap(<WorkoutSummaryIdScreen />), states: withParams((ids) => ({ id: ids.finished })) },
];
