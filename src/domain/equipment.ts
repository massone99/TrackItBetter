/**
 * Equipment in the vocabulary of docs/LANGUAGE.md: apparatus (where an exercise is done: bar,
 * rings…) and resistance bands, grouped in band sets (one per brand or collection).
 */

export interface Apparatus {
  id: string;
  /** Name typed by the user; empty for a built-in that keeps its translated name. */
  name: string;
  /** Built-in apparatus have a key for their translated name. */
  builtin?: string | null;
  archived?: boolean;
}

export interface Band {
  id: string;
  /** Colour or label, e.g. "Blue". */
  name: string;
  /** Swatch shown next to the name, as #rrggbb. */
  color: string;
  /** Assistance in kg at the lightest and strongest stretch; null when not known. */
  minKg: number | null;
  maxKg: number | null;
}

/** A brand's bands, ordered from the lightest to the strongest. */
export interface BandSet {
  id: string;
  name: string;
  bands: Band[];
  archived?: boolean;
}

export type Tension = 1 | 2 | 3;

/** One band used on a set, and how far it was stretched (1 a little, 3 a lot). */
export interface SetBand {
  bandId: string;
  tension: Tension;
}

export const BUILTIN_APPARATUS = ['bar', 'rings', 'parallelBars', 'parallettes', 'floor', 'wallBars'] as const;

export function defaultApparatus(): Apparatus[] {
  return BUILTIN_APPARATUS.map((key) => ({ id: `builtin-${key}`, name: '', builtin: key }));
}

export const BAND_COLORS = ['#F2C94C', '#EB5757', '#27AE60', '#2F80ED', '#9B51E0', '#333333', '#F2994A', '#828282'] as const;

/** Assistance of one band: tension 1 is the minimum, 3 the maximum, 2 halfway; null when its kg are unknown. */
export function bandAssistKg(band: Pick<Band, 'minKg' | 'maxKg'>, tension: Tension): number | null {
  const low = band.minKg ?? band.maxKg;
  const high = band.maxKg ?? band.minKg;
  if (low === null || high === null) return null;
  const value = tension === 1 ? low : tension === 3 ? high : (low + high) / 2;
  return Math.round(value * 10) / 10;
}

/** Total assistance of a set's bands; null without bands or when any band's kg are unknown. */
export function setAssistKg(bands: readonly SetBand[], byId: ReadonlyMap<string, Band>): number | null {
  if (bands.length === 0) return null;
  let total = 0;
  for (const item of bands) {
    const band = byId.get(item.bandId);
    const kg = band ? bandAssistKg(band, item.tension) : null;
    if (kg === null) return null;
    total += kg;
  }
  return Math.round(total * 10) / 10;
}

/** Reads the JSON stored on a set; damaged or missing values give an empty list. */
export function parseSetBands(value: string | null | undefined): SetBand[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): SetBand[] => {
      if (!item || typeof item !== 'object') return [];
      const { bandId, tension } = item as { bandId?: unknown; tension?: unknown };
      return typeof bandId === 'string' && (tension === 1 || tension === 2 || tension === 3) ? [{ bandId, tension }] : [];
    });
  } catch {
    return [];
  }
}

export function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** The apparatus a workout exercise counts as: its own, else the exercise default. */
export function effectiveApparatus(entryApparatusId: string | null | undefined, defaultApparatusId: string | null | undefined): string | null {
  return entryApparatusId ?? defaultApparatusId ?? null;
}

/**
 * Every band's place in one strength order, lightest first, across all band sets: the stored
 * global order, then any band missing from it in band-set order.
 */
export function bandRanks(bandSets: readonly BandSet[], bandOrder: readonly string[]): Map<string, number> {
  const known = new Set(bandSets.flatMap((set) => set.bands.map((band) => band.id)));
  const ordered = [...new Set([...bandOrder.filter((id) => known.has(id)), ...bandSets.flatMap((set) => set.bands.map((band) => band.id))])];
  return new Map(ordered.map((id, index) => [id, index]));
}

/** The global order after a band set was edited: its bands take the slots its old bands had, in their new order; new bands follow its strongest. */
export function orderAfterSetEdit(bandOrder: readonly string[], bandSets: readonly BandSet[], edited: BandSet): string[] {
  const current = [...bandRanks(bandSets, bandOrder).keys()];
  const before = new Set((bandSets.find((set) => set.id === edited.id)?.bands ?? []).map((band) => band.id));
  const kept = edited.bands.map((band) => band.id).filter((id) => before.has(id));
  const added = edited.bands.map((band) => band.id).filter((id) => !before.has(id));
  // Kept bands refill the slots of the old ones, in the new order; slots of removed bands close up.
  let next = 0;
  const result = current.flatMap((id) => (before.has(id) ? (next < kept.length ? [kept[next++]] : []) : [id]));
  if (added.length === 0) return result;
  const lastOfSet = result.reduce((last, id, index) => (kept.includes(id) ? index : last), -1);
  const at = lastOfSet < 0 ? result.length : lastOfSet + 1;
  return [...result.slice(0, at), ...added, ...result.slice(at)];
}

/** Strength of one band on a set: its place in the order first, then its tension. */
const bandLevel = (band: SetBand, ranks: ReadonlyMap<string, number>) => {
  const rank = ranks.get(band.bandId);
  return rank === undefined ? null : rank * 10 + band.tension;
};

/**
 * Which of two sets had more help from bands, using the strength order when kg are unknown:
 * -1 when `a` had less, 0 the same, 1 more, null when the order cannot tell (e.g. a stronger band
 * against two lighter ones). No bands is the least help.
 */
export function compareBandHelp(a: readonly SetBand[], b: readonly SetBand[], ranks: ReadonlyMap<string, number>): -1 | 0 | 1 | null {
  const levels = (bands: readonly SetBand[]) => bands.map((band) => bandLevel(band, ranks));
  const left = levels(a);
  const right = levels(b);
  if (left.some((value) => value === null) || right.some((value) => value === null)) return null;
  const sortDown = (values: (number | null)[]) => (values as number[]).sort((x, y) => y - x);
  const x = sortDown(left);
  const y = sortDown(right);
  // `small` gives no more help than `big` when each of its bands can be matched to a band of `big` at least as strong.
  const covered = (small: number[], big: number[]) => small.length <= big.length && small.every((value, index) => value <= big[index]);
  if (x.length === y.length && x.every((value, index) => value === y[index])) return 0;
  if (covered(x, y)) return -1;
  if (covered(y, x)) return 1;
  return null;
}
