import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { validateUserProgram, type UserProgram, type UserProgramExercise } from '../../domain/userProgram';
import { EXERCISE_CATEGORIES } from '../exercises/categories';
import { createCustomExercise } from '../exercises/customRepository';
import { addImportedExerciseImages } from '../exercises/images';
import { addLink, addStep, createChain, loadGraph } from '../progressions/chains';
import { chainEdges, findCycle, linkProblem, type GraphEdge } from '../../domain/progressionGraph';
import { listExercises } from '../exercises/repository';
import { saveMobilityRoutine } from '../mobility/routines';
import { saveUserProgram } from '../programs/userPrograms';

/** A file with this format brings movements, mobility routines and programs into the app. */
export const IMPORT_FORMAT = 'trackitbetter-import';

const count = (min: number, max: number) => z.number().int().min(min).max(max);

const exerciseSchema = z.object({
  /** How routines and programs in the same file refer to this movement. */
  key: z.string().min(1),
  /** The exercise's id in the app it was exported from: reused when this app has it, else the name decides. */
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  metric: z.enum(['reps', 'time', 'reps_load', 'time_load', 'distance']),
  category: z.enum(EXERCISE_CATEGORIES),
  extraCategories: z.array(z.enum(EXERCISE_CATEGORIES)).default([]),
  unilateral: z.boolean().default(false),
  mobilityMode: z.enum(['active', 'passive']).nullable().default(null),
  equipment: z.array(z.string()).default([]),
  cues: z.array(z.string()).default([]),
  demoUrl: z.string().nullable().default(null),
  /** Pictures of the movement, shown on its page; added to a movement that already exists too, never twice. */
  images: z.array(z.object({
    data: z.string().min(8).max(20_000_000).regex(/^(?:data:image\/[a-z]+;base64,)?[A-Za-z0-9+/]+={0,2}$/),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })).default([]),
});

const stepSchema = z.object({
  /** An exercise `key` of this file, or the id or the name of an exercise already in the app. */
  exercise: z.string().min(1),
  mode: z.enum(['hold', 'reps']),
  seconds: count(5, 600).default(30),
  reps: count(1, 100).default(10),
  perSide: z.boolean().default(false),
  rounds: count(1, 10).default(1),
  restSec: count(0, 300).default(0),
});

const routineSchema = z.object({
  name: z.string().trim().min(1).max(60),
  transitionSec: count(0, 60).default(5),
  prepSec: count(0, 30).default(5),
  steps: z.array(stepSchema).min(1).max(40),
});

const prescriptionSchema = z.object({
  exercise: z.string().min(1),
  sets: count(1, 30).default(1),
  target: z.number().positive().nullable().default(null),
  note: z.string().max(1000).nullable().default(null),
  restSeconds: count(0, 3600).nullable().default(null),
  loadKg: z.number().min(0).nullable().default(null),
  rpe: z.number().nullable().default(null),
  rpePerSet: z.array(z.number().nullable()).nullable().default(null),
  totalTarget: z.number().positive().nullable().default(null),
});

const programSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sessions: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    notes: z.string().max(1000).nullable().default(null),
    exercises: z.array(prescriptionSchema).min(1).max(40),
  })).min(1).max(30),
});

/** What to reach before moving on: sets of reps or of seconds, over some sessions in a row. */
const criteriaSchema = z.object({
  sets: count(1, 20),
  reps: count(1, 1000).optional(),
  seconds: count(1, 3600).optional(),
  requiredSessions: count(1, 20).default(1),
}).refine((value) => (value.reps === undefined) !== (value.seconds === undefined), { message: 'reps or seconds, one of the two' });

const chainSchema = z.object({
  /** How this file names the chain; a chain with the same name in the app gets only the missing steps. */
  key: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  skill: z.string().max(60).default(''),
  steps: z.array(z.object({ exercise: z.string().min(1), criteria: criteriaSchema.nullable().default(null) })).min(1).max(60),
});

const linkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(['progression', 'prerequisite', 'variation']),
  criteria: criteriaSchema.nullable().default(null),
  note: z.string().max(500).default(''),
});

const fileSchema = z.object({
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(1),
  exercises: z.array(exerciseSchema).default([]),
  mobilityRoutines: z.array(routineSchema).default([]),
  programs: z.array(programSchema).default([]),
  chains: z.array(chainSchema).max(200).default([]),
  links: z.array(linkSchema).max(2000).default([]),
});

export type ImportFile = z.infer<typeof fileSchema>;

/** Why a file cannot be imported; `detail` names the offending part. */
export class ImportError extends Error {
  constructor(readonly code: 'invalid' | 'unknownExercise' | 'duplicateKey' | 'empty' | 'program' | 'cycle' | 'chainRepeat', readonly detail: string) {
    super(`${code}: ${detail}`);
  }
}

export interface ImportPlan {
  file: ImportFile;
  /** Movements to create, by key; the others in the file already exist and are reused. */
  create: ImportFile['exercises'];
  /** Exercise id for every key (new ones get theirs when applied) or reference used in the file. */
  existing: Map<string, string>;
  /** Pictures in the file (some may already be in the app and are then skipped). */
  images: number;
}

const norm = (value: string) => value.trim().toLowerCase();

/** Checks a file completely against the exercises already in the app, writing nothing. */
export function planImport(text: string, known: readonly { id: string; name: string }[]): ImportPlan {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ImportError('invalid', 'JSON'); }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError('invalid', parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`).join('; '));
  const file = parsed.data;
  if (file.exercises.length + file.mobilityRoutines.length + file.programs.length + file.chains.length + file.links.length === 0) throw new ImportError('empty', '');
  const keys = new Set<string>();
  for (const exercise of file.exercises) {
    if (keys.has(exercise.key)) throw new ImportError('duplicateKey', exercise.key);
    keys.add(exercise.key);
  }
  const byId = new Map(known.map((item) => [item.id, item.id]));
  const byName = new Map(known.map((item) => [norm(item.name), item.id]));
  // A movement of the file whose name is already in the app is reused instead of duplicated.
  const existing = new Map<string, string>();
  const create: ImportFile['exercises'] = [];
  for (const exercise of file.exercises) {
    const same = (exercise.id ? byId.get(exercise.id) : undefined) ?? byName.get(norm(exercise.name));
    if (same) existing.set(exercise.key, same);
    else create.push(exercise);
  }
  const resolvable = (reference: string) => keys.has(reference) || byId.has(reference) || byName.has(norm(reference));
  const references = [
    ...file.mobilityRoutines.flatMap((routine) => routine.steps.map((step) => step.exercise)),
    ...file.programs.flatMap((program) => program.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.exercise))),
    ...file.chains.flatMap((chain) => chain.steps.map((step) => step.exercise)),
    ...file.links.flatMap((link) => [link.from, link.to]),
  ];
  const missing = [...new Set(references.filter((reference) => !resolvable(reference)))];
  if (missing.length > 0) throw new ImportError('unknownExercise', missing.slice(0, 5).join(', '));
  for (const chain of file.chains) {
    const seen = new Set<string>();
    for (const step of chain.steps) {
      const id = keys.has(step.exercise) ? `key:${step.exercise}` : byId.get(step.exercise) ?? byName.get(norm(step.exercise)) ?? step.exercise;
      if (seen.has(id)) throw new ImportError('chainRepeat', `${chain.name}: ${step.exercise}`);
      seen.add(id);
    }
  }
  for (const program of file.programs) {
    const probe = toProgram(program, (reference) => reference);
    if (validateUserProgram(probe).length > 0) throw new ImportError('program', program.name);
  }
  return { file, create, existing, images: file.exercises.reduce((total, exercise) => total + exercise.images.length, 0) };
}

function toProgram(program: ImportFile['programs'][number], idOf: (reference: string) => string): Pick<UserProgram, 'name' | 'sessions'> {
  return {
    name: program.name,
    sessions: program.sessions.map((session) => ({
      id: Crypto.randomUUID(),
      name: session.name,
      notes: session.notes,
      exercises: session.exercises.map((item): UserProgramExercise => ({
        id: Crypto.randomUUID(), exerciseId: idOf(item.exercise), sets: item.sets, target: item.target, note: item.note,
        restSeconds: item.restSeconds, loadKg: item.loadKg, rpe: item.rpe, rpePerSet: item.rpePerSet, totalTarget: item.totalTarget,
      })),
    })),
  };
}

export interface ImportResult { exercisesCreated: number; routines: number; programs: number; imagesAdded: number; chainsCreated: number; stepsAdded: number; linksAdded: number }

/** What the chains and relations of a file change: new chains, steps added to chains already there, new relations, and what is skipped. */
export interface GraphPreview { chainsCreated: number; chainsExtended: number; stepsAdded: number; linksAdded: number; skipped: number }

type GraphPlan = {
  preview: GraphPreview;
  /** Per chain of the file: the chain in the app (null = new) and the steps to append, as references of the file. */
  chains: { chain: ImportFile['chains'][number]; existingId: string | null; steps: ImportFile['chains'][number]['steps'] }[];
  links: ImportFile['links'];
};

/**
 * Works out what the chains and relations of a file add to the app, writing nothing: a chain with the
 * same name gets only its missing steps, a relation already there is skipped. Refuses a file that would
 * make a loop (A → B → A), naming the exercises. `idOf` turns a reference of the file into an exercise
 * id (a movement the file creates keeps `key:<key>` until it exists).
 */
export async function planGraph(plan: ImportPlan, idOf?: (reference: string) => string): Promise<GraphPlan> {
  const known = await listExercises();
  const byId = new Set(known.map((item) => item.id));
  const byName = new Map(known.map((item) => [norm(item.name), item.id]));
  const keys = new Set(plan.file.exercises.map((exercise) => exercise.key));
  const resolve = idOf ?? ((reference: string) => plan.existing.get(reference) ?? (keys.has(reference) ? `key:${reference}` : byId.has(reference) ? reference : byName.get(norm(reference)) ?? reference));
  const graph = await loadGraph();
  const chainByName = new Map(graph.chains.map((chain) => [norm(chain.name), chain]));
  const edges: GraphEdge[] = [...graph.edges];
  const result: GraphPlan = { preview: { chainsCreated: 0, chainsExtended: 0, stepsAdded: 0, linksAdded: 0, skipped: 0 }, chains: [], links: [] };
  const stepRefs = [...graph.steps];
  for (const chain of plan.file.chains) {
    const existing = chainByName.get(norm(chain.name)) ?? null;
    const have = new Set(existing ? graph.steps.filter((step) => step.chainId === existing.id).map((step) => step.exerciseId) : []);
    const steps = chain.steps.filter((step) => !have.has(resolve(step.exercise)));
    result.preview.skipped += chain.steps.length - steps.length;
    if (steps.length === 0) continue;
    const chainId = existing?.id ?? `new:${chain.name}`;
    let position = Math.max(0, ...stepRefs.filter((step) => step.chainId === chainId).map((step) => step.position));
    for (const step of steps) stepRefs.push({ chainId, exerciseId: resolve(step.exercise), position: ++position });
    if (existing) result.preview.chainsExtended += 1; else result.preview.chainsCreated += 1;
    result.preview.stepsAdded += steps.length;
    result.chains.push({ chain, existingId: existing?.id ?? null, steps });
  }
  edges.splice(0, edges.length, ...chainEdges(stepRefs), ...graph.links);
  for (const link of plan.file.links) {
    const candidate = { from: resolve(link.from), to: resolve(link.to), kind: link.kind } as const;
    const problem = linkProblem(edges, candidate);
    if (problem?.kind === 'duplicate') { result.preview.skipped += 1; continue; }
    if (problem?.kind === 'self') throw new ImportError('invalid', `${link.from} → ${link.to}`);
    edges.push(candidate);
    result.links.push(link);
    result.preview.linksAdded += 1;
  }
  const cycle = findCycle(edges);
  if (cycle) {
    const names = new Map(known.map((item) => [item.id, item.name]));
    const label = (id: string) => (id.startsWith('key:') ? plan.file.exercises.find((exercise) => exercise.key === id.slice(4))?.name ?? id : names.get(id) ?? id);
    throw new ImportError('cycle', cycle.map(label).join(' → '));
  }
  return result;
}

/** Writes a checked plan: the movements first, then the routines and programs that use them. */
export async function applyImport(plan: ImportPlan): Promise<ImportResult> {
  const ids = new Map(plan.existing);
  for (const exercise of plan.create) {
    ids.set(exercise.key, await createCustomExercise({
      name: exercise.name, metric: exercise.metric, category: exercise.category, extraCategories: exercise.extraCategories,
      unilateral: exercise.unilateral, mobilityMode: exercise.mobilityMode, equipment: exercise.equipment, cues: exercise.cues, demoUrl: exercise.demoUrl,
    }));
  }
  let imagesAdded = 0;
  for (const exercise of plan.file.exercises) {
    const exerciseId = ids.get(exercise.key);
    if (exerciseId) imagesAdded += await addImportedExerciseImages(exerciseId, exercise.images);
  }
  const known = await listExercises();
  const byId = new Set(known.map((item) => item.id));
  const byName = new Map(known.map((item) => [norm(item.name), item.id]));
  const idOf = (reference: string) => ids.get(reference) ?? (byId.has(reference) ? reference : byName.get(norm(reference)) ?? reference);
  for (const routine of plan.file.mobilityRoutines) {
    await saveMobilityRoutine({
      name: routine.name, transitionSec: routine.transitionSec, prepSec: routine.prepSec,
      steps: routine.steps.map((step) => ({ id: Crypto.randomUUID(), exerciseId: idOf(step.exercise), mode: step.mode, seconds: step.seconds, reps: step.reps, perSide: step.perSide, rounds: step.rounds, restSec: step.restSec })),
    });
  }
  for (const program of plan.file.programs) await saveUserProgram(toProgram(program, idOf));
  const graph = await planGraph(plan, idOf);
  for (const { chain, existingId, steps } of graph.chains) {
    const chainId = existingId ?? await createChain({ name: chain.name, description: chain.description, family: chain.skill });
    for (const step of steps) await addStep(chainId, idOf(step.exercise), null, step.criteria);
  }
  for (const link of graph.links) await addLink({ fromId: idOf(link.from), toId: idOf(link.to), kind: link.kind, criteria: link.criteria, note: link.note });
  return {
    exercisesCreated: plan.create.length, routines: plan.file.mobilityRoutines.length, programs: plan.file.programs.length, imagesAdded,
    chainsCreated: graph.preview.chainsCreated, stepsAdded: graph.preview.stepsAdded, linksAdded: graph.preview.linksAdded,
  };
}

/** Reads, checks and applies a file in one go. */
export async function importJson(text: string): Promise<ImportResult> {
  const known = await listExercises();
  return applyImport(planImport(text, known));
}
