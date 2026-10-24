import { asc, inArray } from 'drizzle-orm';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db, initializeDatabase } from '../../db/client';
import { chainSteps, exerciseLinks, exercises, progressionChains } from '../../db/schema';
import { criteriaFromRow, type Criteria } from './chains';

const list = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/** A readable key from a name ("Tuck Planche" → "tuck-planche"), made unique with -2, -3, … */
function keyMaker() {
  const used = new Set<string>();
  return (name: string) => {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    let key = base;
    for (let index = 2; used.has(key); index += 1) key = `${base}-${index}`;
    used.add(key);
    return key;
  };
}

const criteriaOut = (criteria: Criteria | null) => (criteria
  ? criteria.seconds !== undefined
    ? { sets: criteria.sets, seconds: criteria.seconds, requiredSessions: criteria.requiredSessions }
    : { sets: criteria.sets, reps: criteria.reps, requiredSessions: criteria.requiredSessions }
  : null);

/**
 * The chains (all when `chainIds` is null) as a TrackItBetter import file: the chains with their steps
 * and criteria, the movements they use, and the relations among those movements. Keys come from names,
 * so the same chains export to the same file on any device, and importing it adds only what is missing.
 */
export async function buildChainsFile(chainIds: readonly string[] | null) {
  await initializeDatabase();
  const chains = (await db.select().from(progressionChains).orderBy(asc(progressionChains.name)))
    .filter((chain) => chainIds === null || chainIds.includes(chain.id));
  const steps = chains.length === 0 ? [] : await db.select().from(chainSteps).where(inArray(chainSteps.chainId, chains.map((chain) => chain.id))).orderBy(asc(chainSteps.position));
  const allLinks = await db.select().from(exerciseLinks);
  const used = new Set(steps.map((step) => step.exerciseId));
  // Every relation when exporting all; otherwise the ones between the chains' movements.
  const links = allLinks.filter((link) => chainIds === null || (used.has(link.fromId) && used.has(link.toId)));
  links.forEach((link) => { used.add(link.fromId); used.add(link.toId); });
  const rows = used.size === 0 ? [] : await db.select().from(exercises).where(inArray(exercises.id, [...used]));
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const exerciseKey = keyMaker();
  const keyOf = new Map(rows.map((row) => [row.id, exerciseKey(row.name)]));
  const chainKey = keyMaker();
  const name = (id: string) => rows.find((row) => row.id === id)?.name ?? '';
  return {
    format: 'trackitbetter-import' as const,
    version: 1 as const,
    exercises: rows.map((row) => ({
      key: keyOf.get(row.id)!,
      id: row.id,
      name: row.name,
      metric: row.metric,
      category: row.category,
      extraCategories: list(row.extraCategories),
      unilateral: row.unilateral,
      mobilityMode: row.mobilityMode ?? null,
      equipment: list(row.equipment),
      cues: list(row.cues),
      demoUrl: row.demoUrl ?? null,
    })),
    chains: chains.map((chain) => ({
      key: chainKey(chain.name),
      name: chain.name,
      description: chain.description,
      skill: chain.family,
      steps: steps.filter((step) => step.chainId === chain.id).map((step) => ({ exercise: keyOf.get(step.exerciseId)!, criteria: criteriaOut(criteriaFromRow(step.target, step.requiredSessions)) })),
    })).filter((chain) => chain.steps.length > 0),
    links: links
      .map((link) => ({ from: keyOf.get(link.fromId)!, to: keyOf.get(link.toId)!, kind: link.kind, criteria: criteriaOut(criteriaFromRow(link.target, link.requiredSessions)), note: link.note, sort: `${name(link.fromId)}|${name(link.toId)}|${link.kind}` }))
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ sort: _sort, ...link }) => link),
  };
}

/** Writes the chains file to the cache and opens the share sheet; 'unavailable' when the device cannot share. */
export async function shareChainsFile(chainIds: readonly string[] | null, dialogTitle: string): Promise<'shared' | 'unavailable'> {
  const contents = JSON.stringify(await buildChainsFile(chainIds), null, 2);
  const file = new File(Paths.cache, `trackitbetter-chains-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(contents);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
  return 'shared';
}
