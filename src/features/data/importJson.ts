import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { validateUserProgram, type UserProgram, type UserProgramExercise } from '../../domain/userProgram';
import { EXERCISE_CATEGORIES } from '../exercises/categories';
import { createCustomExercise } from '../exercises/customRepository';
import { addImportedExerciseImages } from '../exercises/images';
import { listExercises } from '../exercises/repository';
import { saveMobilityRoutine } from '../mobility/routines';
import { saveUserProgram } from '../programs/userPrograms';

/** A file with this format brings movements, mobility routines and programs into the app. */
export const IMPORT_FORMAT = 'trackitbetter-import';

const count = (min: number, max: number) => z.number().int().min(min).max(max);

const exerciseSchema = z.object({
  /** How routines and programs in the same file refer to this movement. */
  key: z.string().min(1),
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

const fileSchema = z.object({
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(1),
  exercises: z.array(exerciseSchema).default([]),
  mobilityRoutines: z.array(routineSchema).default([]),
  programs: z.array(programSchema).default([]),
});

export type ImportFile = z.infer<typeof fileSchema>;

/** Why a file cannot be imported; `detail` names the offending part. */
export class ImportError extends Error {
  constructor(readonly code: 'invalid' | 'unknownExercise' | 'duplicateKey' | 'empty' | 'program', readonly detail: string) {
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
  if (file.exercises.length + file.mobilityRoutines.length + file.programs.length === 0) throw new ImportError('empty', '');
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
    const same = byName.get(norm(exercise.name));
    if (same) existing.set(exercise.key, same);
    else create.push(exercise);
  }
  const resolvable = (reference: string) => keys.has(reference) || byId.has(reference) || byName.has(norm(reference));
  const references = [
    ...file.mobilityRoutines.flatMap((routine) => routine.steps.map((step) => step.exercise)),
    ...file.programs.flatMap((program) => program.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.exercise))),
  ];
  const missing = [...new Set(references.filter((reference) => !resolvable(reference)))];
  if (missing.length > 0) throw new ImportError('unknownExercise', missing.slice(0, 5).join(', '));
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

export interface ImportResult { exercisesCreated: number; routines: number; programs: number; imagesAdded: number }

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
  return { exercisesCreated: plan.create.length, routines: plan.file.mobilityRoutines.length, programs: plan.file.programs.length, imagesAdded };
}

/** Reads, checks and applies a file in one go. */
export async function importJson(text: string): Promise<ImportResult> {
  const known = await listExercises();
  return applyImport(planImport(text, known));
}
