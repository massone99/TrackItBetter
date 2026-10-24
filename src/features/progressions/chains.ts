import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { chainSteps, exerciseEntries, exerciseLinks, exercises, levelCriteria, progressionChains, trainingSets, workouts } from '../../db/schema';
import { evaluateProgression, type ProgressionSession, type ProgressionTarget } from '../../domain/progression';
import { chainEdges, exerciseTree, findCycle, linkProblem, type ExerciseTree, type GraphEdge, type LinkKind, type LinkProblem, type StepRef } from '../../domain/progressionGraph';
import { aggregatePairs } from '../../domain/setPairs';
import { parseCriteria } from './repository';

/** What to reach before moving on: sets of reps or seconds, over some sessions in a row. */
export type Criteria = { sets: number; reps?: number; seconds?: number; requiredSessions: number };

/** A relation or a chain change the graph refuses; `problem` says why (with the loop it would make). */
export class GraphError extends Error {
  constructor(readonly problem: LinkProblem | { kind: 'inChain' }) {
    super(problem.kind);
  }
}

export function criteriaToJson(criteria: Criteria | null): string | null {
  if (!criteria) return null;
  return criteria.seconds !== undefined
    ? JSON.stringify({ sets: criteria.sets, durationSec: criteria.seconds, unit: 'seconds' })
    : JSON.stringify({ sets: criteria.sets, reps: criteria.reps ?? 1, unit: 'reps' });
}

export function criteriaFromRow(target: string | null, requiredSessions: number): Criteria | null {
  if (!target) return null;
  const parsed = parseCriteria(target, requiredSessions).target;
  if (!parsed) return null;
  return parsed.durationSec !== undefined
    ? { sets: parsed.sets, seconds: parsed.durationSec, requiredSessions }
    : { sets: parsed.sets, reps: parsed.reps ?? 1, requiredSessions };
}

const toTarget = (criteria: Criteria): ProgressionTarget => (criteria.seconds !== undefined ? { sets: criteria.sets, durationSec: criteria.seconds } : { sets: criteria.sets, reps: criteria.reps ?? 1 });

type History = { sessions: ProgressionSession[]; bestReps: number | null; bestSeconds: number | null };

/** Finished working sets of some exercises, one session per workout (newest first), and their best single set. */
async function historyOf(ids: readonly string[]): Promise<Map<string, History>> {
  const result = new Map<string, History>();
  if (ids.length === 0) return result;
  const rows = await db.select({
    exerciseId: exerciseEntries.exerciseId,
    workoutId: workouts.id,
    startedAt: workouts.startedAt,
    id: trainingSets.id,
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    index: trainingSets.index,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    addedLoadKg: trainingSets.addedLoadKg,
  })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(inArray(exerciseEntries.exerciseId, [...ids]), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(desc(workouts.startedAt), asc(trainingSets.index));
  const byExercise = new Map<string, Map<string, ProgressionSession['sets'][number][]>>();
  for (const row of aggregatePairs(rows.map((row) => ({ ...row, side: row.side ?? undefined })))) {
    const sessions = byExercise.get(row.exerciseId) ?? new Map<string, ProgressionSession['sets'][number][]>();
    byExercise.set(row.exerciseId, sessions);
    sessions.set(row.workoutId, [...(sessions.get(row.workoutId) ?? []), { reps: row.reps ?? undefined, durationSec: row.durationSec ?? undefined, addedLoadKg: row.addedLoadKg ?? 0 }]);
  }
  for (const [exerciseId, sessions] of byExercise) {
    const all = [...sessions.values()].flat();
    const best = (values: (number | undefined)[]) => { const ok = values.filter((value): value is number => value !== undefined && value > 0); return ok.length ? Math.max(...ok) : null; };
    result.set(exerciseId, {
      sessions: [...sessions.values()].map((sets) => ({ completed: true, sets })),
      bestReps: best(all.map((set) => set.reps)),
      bestSeconds: best(all.map((set) => set.durationSec)),
    });
  }
  return result;
}

/** Whether the criteria are met in history: the needed sessions in a row, the newest first. */
function criteriaMet(criteria: Criteria | null, history: History | undefined): boolean {
  if (!criteria || !history) return false;
  return evaluateProgression(toTarget(criteria), { successfulSessionsToProgress: criteria.requiredSessions, action: { kind: 'increase_reps', amount: 1 } }, history.sessions).eligible;
}

export type StepView = {
  id: string;
  exerciseId: string;
  name: string;
  metric: string;
  position: number;
  criteria: Criteria | null;
  reachedAt: Date | null;
  /** Marked by hand or met in history. */
  reached: boolean;
  best: { reps: number | null; seconds: number | null };
};

export type ChainView = { id: string; name: string; description: string; family: string; steps: StepView[]; reachedLevel: number };

async function stepsOf(chainIds: readonly string[]): Promise<Map<string, StepView[]>> {
  const rows = chainIds.length === 0 ? [] : await db.select({ step: chainSteps, name: exercises.name, metric: exercises.metric })
    .from(chainSteps).innerJoin(exercises, eq(chainSteps.exerciseId, exercises.id))
    .where(inArray(chainSteps.chainId, [...chainIds])).orderBy(asc(chainSteps.position));
  const history = await historyOf([...new Set(rows.map((row) => row.step.exerciseId))]);
  const result = new Map<string, StepView[]>();
  for (const { step, name, metric } of rows) {
    const criteria = criteriaFromRow(step.target, step.requiredSessions);
    const own = history.get(step.exerciseId);
    const list = result.get(step.chainId) ?? [];
    list.push({
      id: step.id, exerciseId: step.exerciseId, name, metric, position: list.length + 1, criteria, reachedAt: step.reachedAt,
      reached: step.reachedAt !== null || criteriaMet(criteria, own), best: { reps: own?.bestReps ?? null, seconds: own?.bestSeconds ?? null },
    });
    result.set(step.chainId, list);
  }
  return result;
}

/** The highest step reached (0 for none). */
const reachedLevel = (steps: readonly StepView[]) => steps.reduce((level, step, index) => (step.reached ? index + 1 : level), 0);

export async function listChains(): Promise<ChainView[]> {
  await initializeDatabase();
  const chains = await db.select().from(progressionChains).orderBy(asc(progressionChains.name));
  const steps = await stepsOf(chains.map((chain) => chain.id));
  return chains.map((chain) => {
    const own = steps.get(chain.id) ?? [];
    return { ...chain, steps: own, reachedLevel: reachedLevel(own) };
  });
}

export async function getChain(id: string): Promise<ChainView | null> {
  await initializeDatabase();
  const [chain] = await db.select().from(progressionChains).where(eq(progressionChains.id, id)).limit(1);
  if (!chain) return null;
  const own = (await stepsOf([id])).get(id) ?? [];
  return { ...chain, steps: own, reachedLevel: reachedLevel(own) };
}

/** The whole graph as plain data: chains, their steps and the single links (for imports and checks). */
export async function loadGraph(): Promise<{ chains: { id: string; name: string }[]; steps: StepRef[]; links: GraphEdge[]; edges: GraphEdge[] }> {
  await initializeDatabase();
  const [chains, steps, links] = await Promise.all([
    db.select({ id: progressionChains.id, name: progressionChains.name }).from(progressionChains),
    db.select({ chainId: chainSteps.chainId, exerciseId: chainSteps.exerciseId, position: chainSteps.position }).from(chainSteps),
    db.select({ from: exerciseLinks.fromId, to: exerciseLinks.toId, kind: exerciseLinks.kind }).from(exerciseLinks),
  ]);
  const typed = links.map((link) => ({ ...link, kind: link.kind as LinkKind }));
  return { chains, steps, links: typed, edges: [...chainEdges(steps), ...typed] };
}

/** Every directed and side relation: chain steps as progressions plus the single links. */
async function allEdges(): Promise<GraphEdge[]> {
  const [steps, links] = await Promise.all([
    db.select({ chainId: chainSteps.chainId, exerciseId: chainSteps.exerciseId, position: chainSteps.position }).from(chainSteps),
    db.select({ from: exerciseLinks.fromId, to: exerciseLinks.toId, kind: exerciseLinks.kind }).from(exerciseLinks),
  ]);
  return [...chainEdges(steps), ...links.map((link) => ({ ...link, kind: link.kind as LinkKind }))];
}

export type ChainFields = { name: string; description: string; family: string };

export async function createChain(fields: ChainFields, exerciseIds: readonly string[] = []): Promise<string> {
  await initializeDatabase();
  const id = Crypto.randomUUID();
  await db.insert(progressionChains).values({ id, ...cleanFields(fields) });
  for (const exerciseId of exerciseIds) await addStep(id, exerciseId);
  return id;
}

function cleanFields(fields: ChainFields): ChainFields {
  return { name: fields.name.trim().slice(0, 80) || 'Chain', description: fields.description.trim().slice(0, 500), family: fields.family.trim().slice(0, 60) };
}

export async function updateChain(id: string, fields: ChainFields): Promise<void> {
  await initializeDatabase();
  await db.update(progressionChains).set(cleanFields(fields)).where(eq(progressionChains.id, id));
}

/** Deletes a chain and its steps; exercises, their history and single links stay. */
export async function deleteChain(id: string): Promise<void> {
  await initializeDatabase();
  await db.transaction(async (tx) => {
    await tx.delete(chainSteps).where(eq(chainSteps.chainId, id));
    await tx.delete(levelCriteria).where(eq(levelCriteria.chainId, id));
    await tx.update(exercises).set({ chainId: null }).where(eq(exercises.chainId, id));
    await tx.delete(progressionChains).where(eq(progressionChains.id, id));
  });
}

async function chainRows(chainId: string) {
  return db.select().from(chainSteps).where(eq(chainSteps.chainId, chainId)).orderBy(asc(chainSteps.position));
}

/**
 * Writes a chain's steps in a new order (positions 1, 2, …), after checking the whole graph keeps no
 * loop. `rows` are the steps as they should end up.
 */
async function writeSteps(chainId: string, rows: (typeof chainSteps.$inferSelect)[]): Promise<void> {
  const others = (await db.select({ chainId: chainSteps.chainId, exerciseId: chainSteps.exerciseId, position: chainSteps.position }).from(chainSteps))
    .filter((step) => step.chainId !== chainId);
  const links = (await db.select({ from: exerciseLinks.fromId, to: exerciseLinks.toId, kind: exerciseLinks.kind }).from(exerciseLinks)).map((link) => ({ ...link, kind: link.kind as LinkKind }));
  const mine = rows.map((row, index) => ({ chainId, exerciseId: row.exerciseId, position: index + 1 }));
  const path = findCycle([...chainEdges([...others, ...mine]), ...links]);
  if (path) throw new GraphError({ kind: 'cycle', path });
  await db.transaction(async (tx) => {
    await tx.delete(chainSteps).where(eq(chainSteps.chainId, chainId));
    if (rows.length > 0) await tx.insert(chainSteps).values(rows.map((row, index) => ({ ...row, chainId, position: index + 1 })));
  });
}

/** Adds an exercise to a chain, at the end or right after a step. */
export async function addStep(chainId: string, exerciseId: string, afterStepId?: string | null, criteria: Criteria | null = null): Promise<void> {
  await initializeDatabase();
  const rows = await chainRows(chainId);
  if (rows.some((row) => row.exerciseId === exerciseId)) throw new GraphError({ kind: 'inChain' });
  const at = afterStepId ? rows.findIndex((row) => row.id === afterStepId) + 1 : rows.length;
  const step = { id: Crypto.randomUUID(), chainId, exerciseId, position: 0, target: criteriaToJson(criteria), requiredSessions: criteria?.requiredSessions ?? 1, reachedAt: null };
  rows.splice(at <= 0 ? rows.length : at, 0, step);
  await writeSteps(chainId, rows);
}

export async function moveStep(stepId: string, delta: -1 | 1): Promise<void> {
  await initializeDatabase();
  const [step] = await db.select().from(chainSteps).where(eq(chainSteps.id, stepId)).limit(1);
  if (!step) return;
  const rows = await chainRows(step.chainId);
  const index = rows.findIndex((row) => row.id === stepId);
  const target = index + delta;
  if (target < 0 || target >= rows.length) return;
  [rows[index], rows[target]] = [rows[target], rows[index]];
  await writeSteps(step.chainId, rows);
}

/** Removes a step and returns it with its place, so "Restore" can put it back. */
export async function removeStep(stepId: string): Promise<{ row: typeof chainSteps.$inferSelect; index: number } | null> {
  await initializeDatabase();
  const [step] = await db.select().from(chainSteps).where(eq(chainSteps.id, stepId)).limit(1);
  if (!step) return null;
  const rows = await chainRows(step.chainId);
  const index = rows.findIndex((row) => row.id === stepId);
  await writeSteps(step.chainId, rows.filter((row) => row.id !== stepId));
  return { row: step, index };
}

export async function restoreStep(removed: { row: typeof chainSteps.$inferSelect; index: number }): Promise<void> {
  await initializeDatabase();
  const rows = (await chainRows(removed.row.chainId)).filter((row) => row.exerciseId !== removed.row.exerciseId);
  rows.splice(Math.min(removed.index, rows.length), 0, removed.row);
  await writeSteps(removed.row.chainId, rows);
}

export async function updateStepCriteria(stepId: string, criteria: Criteria | null): Promise<void> {
  await initializeDatabase();
  await db.update(chainSteps).set({ target: criteriaToJson(criteria), requiredSessions: criteria?.requiredSessions ?? 1 }).where(eq(chainSteps.id, stepId));
}

export async function markStepReached(stepId: string, reached: boolean): Promise<void> {
  await initializeDatabase();
  await db.update(chainSteps).set({ reachedAt: reached ? new Date() : null }).where(eq(chainSteps.id, stepId));
}

/** A copy of a chain with the same steps and criteria (not the reached marks). */
export async function duplicateChain(id: string, name: string): Promise<string | null> {
  await initializeDatabase();
  const [chain] = await db.select().from(progressionChains).where(eq(progressionChains.id, id)).limit(1);
  if (!chain) return null;
  const copy = Crypto.randomUUID();
  const rows = await chainRows(id);
  await db.transaction(async (tx) => {
    await tx.insert(progressionChains).values({ id: copy, name: name.trim().slice(0, 80) || chain.name, description: chain.description, family: chain.family });
    if (rows.length) await tx.insert(chainSteps).values(rows.map((row) => ({ ...row, id: Crypto.randomUUID(), chainId: copy, reachedAt: null })));
  });
  return copy;
}

/** Moves the steps from `stepId` on into a new chain; returns its id. */
export async function splitChain(stepId: string, name: string): Promise<string | null> {
  await initializeDatabase();
  const [step] = await db.select().from(chainSteps).where(eq(chainSteps.id, stepId)).limit(1);
  if (!step) return null;
  const [chain] = await db.select().from(progressionChains).where(eq(progressionChains.id, step.chainId)).limit(1);
  const rows = await chainRows(step.chainId);
  const at = rows.findIndex((row) => row.id === stepId);
  if (at <= 0) return null;
  const id = Crypto.randomUUID();
  await db.insert(progressionChains).values({ id, name: name.trim().slice(0, 80) || chain.name, description: chain.description, family: chain.family });
  await writeSteps(step.chainId, rows.slice(0, at));
  await writeSteps(id, rows.slice(at).map((row) => ({ ...row, chainId: id })));
  return id;
}

/** Appends the steps of `fromId` to `intoId` (skipping exercises already there) and deletes `fromId`. */
export async function mergeChains(intoId: string, fromId: string): Promise<void> {
  await initializeDatabase();
  if (intoId === fromId) return;
  const into = await chainRows(intoId);
  const from = (await chainRows(fromId)).filter((row) => !into.some((item) => item.exerciseId === row.exerciseId));
  const merged = [...into, ...from.map((row) => ({ ...row, id: Crypto.randomUUID(), chainId: intoId }))];
  // Checked as if the old chain were gone already, so its own steps do not count twice.
  await db.delete(chainSteps).where(eq(chainSteps.chainId, fromId));
  try {
    await writeSteps(intoId, merged);
  } catch (error) {
    await db.insert(chainSteps).values(await Promise.resolve(from)).onConflictDoNothing();
    throw error;
  }
  await deleteChain(fromId);
}

export type LinkView = { id: string; fromId: string; toId: string; fromName: string; toName: string; kind: LinkKind; criteria: Criteria | null; note: string };

export async function listLinks(exerciseId?: string): Promise<LinkView[]> {
  await initializeDatabase();
  const rows = await db.select().from(exerciseLinks)
    .where(exerciseId ? or(eq(exerciseLinks.fromId, exerciseId), eq(exerciseLinks.toId, exerciseId)) : undefined);
  const names = await exerciseNames();
  return rows.map((row) => ({
    id: row.id, fromId: row.fromId, toId: row.toId, fromName: names.get(row.fromId) ?? row.fromId, toName: names.get(row.toId) ?? row.toId,
    kind: row.kind as LinkKind, criteria: criteriaFromRow(row.target, row.requiredSessions), note: row.note,
  }));
}

export type LinkInput = { fromId: string; toId: string; kind: LinkKind; criteria: Criteria | null; note: string };

/** Adds a relation after checking it is not to itself, a duplicate or the start of a loop. */
export async function addLink(input: LinkInput): Promise<string> {
  await initializeDatabase();
  const problem = linkProblem(await allEdges(), { from: input.fromId, to: input.toId, kind: input.kind });
  if (problem) throw new GraphError(problem);
  const id = Crypto.randomUUID();
  await db.insert(exerciseLinks).values({ id, fromId: input.fromId, toId: input.toId, kind: input.kind, target: criteriaToJson(input.criteria), requiredSessions: input.criteria?.requiredSessions ?? 1, note: input.note.trim().slice(0, 500) });
  return id;
}

/** Changes a relation (kind, direction, criteria, note), checked as if it were new. */
export async function updateLink(id: string, input: LinkInput): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select().from(exerciseLinks).where(eq(exerciseLinks.id, id)).limit(1);
  if (!current) return;
  const edges = (await allEdges()).filter((edge) => !(edge.from === current.fromId && edge.to === current.toId && edge.kind === current.kind));
  const problem = linkProblem(edges, { from: input.fromId, to: input.toId, kind: input.kind });
  if (problem) throw new GraphError(problem);
  await db.update(exerciseLinks).set({ fromId: input.fromId, toId: input.toId, kind: input.kind, target: criteriaToJson(input.criteria), requiredSessions: input.criteria?.requiredSessions ?? 1, note: input.note.trim().slice(0, 500) }).where(eq(exerciseLinks.id, id));
}

export async function deleteLink(id: string): Promise<typeof exerciseLinks.$inferSelect | null> {
  await initializeDatabase();
  const [row] = await db.select().from(exerciseLinks).where(eq(exerciseLinks.id, id)).limit(1);
  if (!row) return null;
  await db.delete(exerciseLinks).where(eq(exerciseLinks.id, id));
  return row;
}

export async function restoreLink(row: typeof exerciseLinks.$inferSelect): Promise<void> {
  await initializeDatabase();
  await db.insert(exerciseLinks).values(row).onConflictDoNothing();
}

async function exerciseNames(): Promise<Map<string, string>> {
  const rows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises);
  return new Map(rows.map((row) => [row.id, row.name]));
}

export type ExerciseProgressions = {
  tree: ExerciseTree;
  names: Map<string, string>;
  best: Map<string, { reps: number | null; seconds: number | null }>;
  /** Where the next step's criteria are met: the exercise ids reached. */
  reached: Set<string>;
  chains: { id: string; name: string; position: number; count: number }[];
  links: LinkView[];
};

/** All an exercise page needs: its tree, the chains it is in and its single relations. */
export async function getExerciseProgressions(exerciseId: string): Promise<ExerciseProgressions> {
  await initializeDatabase();
  const edges = await allEdges();
  const tree = exerciseTree(edges, exerciseId);
  const ids = [exerciseId, ...tree.regressions.map((node) => node.id), ...tree.progressions.map((node) => node.id), ...tree.prerequisites, ...tree.unlocks, ...tree.variations];
  const [names, history, steps, links] = await Promise.all([
    exerciseNames(),
    historyOf(ids),
    db.select({ step: chainSteps, chainName: progressionChains.name }).from(chainSteps).innerJoin(progressionChains, eq(chainSteps.chainId, progressionChains.id)),
    listLinks(exerciseId),
  ]);
  const reached = new Set<string>();
  for (const { step } of steps) {
    if (step.reachedAt !== null || criteriaMet(criteriaFromRow(step.target, step.requiredSessions), history.get(step.exerciseId))) reached.add(step.exerciseId);
  }
  const counts = new Map<string, number>();
  for (const { step } of steps) counts.set(step.chainId, (counts.get(step.chainId) ?? 0) + 1);
  const chains = steps.filter(({ step }) => step.exerciseId === exerciseId).map(({ step, chainName }) => {
    const order = steps.filter((item) => item.step.chainId === step.chainId).sort((a, b) => a.step.position - b.step.position);
    return { id: step.chainId, name: chainName, position: order.findIndex((item) => item.step.id === step.id) + 1, count: counts.get(step.chainId) ?? 0 };
  });
  const best = new Map([...history].map(([id, item]) => [id, { reps: item.bestReps, seconds: item.bestSeconds }]));
  return { tree, names, best, reached, chains, links };
}

/** Exercises (not archived) in no chain and no relation. */
export async function unlinkedExercises(): Promise<{ id: string; name: string }[]> {
  await initializeDatabase();
  const [all, steps, links] = await Promise.all([
    db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(eq(exercises.archived, false)).orderBy(asc(exercises.name)),
    db.select({ id: chainSteps.exerciseId }).from(chainSteps),
    db.select({ from: exerciseLinks.fromId, to: exerciseLinks.toId }).from(exerciseLinks),
  ]);
  const used = new Set([...steps.map((step) => step.id), ...links.flatMap((link) => [link.from, link.to])]);
  return all.filter((exercise) => !used.has(exercise.id));
}
