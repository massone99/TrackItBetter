import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';
import { defaultApparatus, orderAfterSetEdit, type Apparatus, type Band, type BandSet } from '../../domain/equipment';

export type { Apparatus, Band, BandSet, SetBand, Tension } from '../../domain/equipment';

/** Apparatus and band sets are global (one list for every exercise), kept as one JSON setting. */
const KEY = 'equipment_v1';

export interface EquipmentCatalog {
  apparatus: Apparatus[];
  bandSets: BandSet[];
  /** Every band from the lightest to the strongest, across band sets (see bandRanks). */
  bandOrder: string[];
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/** Reads stored equipment, dropping damaged rows; before the first save, the built-in apparatus. */
export function parseCatalog(value: unknown): EquipmentCatalog {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const apparatus = Array.isArray(source.apparatus)
    ? source.apparatus.flatMap((item): Apparatus[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string') return [];
      return [{ id: row.id, name: row.name, builtin: typeof row.builtin === 'string' ? row.builtin : null, archived: row.archived === true }];
    })
    : defaultApparatus();
  const bandSets = Array.isArray(source.bandSets)
    ? source.bandSets.flatMap((item): BandSet[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || !Array.isArray(row.bands)) return [];
      const bands = row.bands.flatMap((band): Band[] => {
        if (!band || typeof band !== 'object') return [];
        const b = band as Record<string, unknown>;
        if (typeof b.id !== 'string' || typeof b.name !== 'string') return [];
        return [{ id: b.id, name: b.name, color: typeof b.color === 'string' ? b.color : '#828282', minKg: finite(b.minKg), maxKg: finite(b.maxKg) }];
      });
      return [{ id: row.id, name: row.name, bands, archived: row.archived === true }];
    })
    : [];
  const bandOrder = Array.isArray(source.bandOrder) ? source.bandOrder.filter((id): id is string => typeof id === 'string') : [];
  return { apparatus, bandSets, bandOrder };
}

export async function getEquipment(): Promise<EquipmentCatalog> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return parseCatalog(null);
  try {
    return parseCatalog(JSON.parse(row.value));
  } catch {
    return parseCatalog(null);
  }
}

async function writeEquipment(catalog: EquipmentCatalog): Promise<EquipmentCatalog> {
  const value = JSON.stringify(catalog);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  return catalog;
}

const newId = () => Crypto.randomUUID();

export async function addApparatus(name: string): Promise<Apparatus> {
  const catalog = await getEquipment();
  const apparatus: Apparatus = { id: newId(), name: name.trim(), builtin: null };
  await writeEquipment({ ...catalog, apparatus: [...catalog.apparatus, apparatus] });
  return apparatus;
}

/** Renaming a built-in gives it the typed name instead of the translated one. */
export async function renameApparatus(id: string, name: string): Promise<void> {
  const catalog = await getEquipment();
  await writeEquipment({ ...catalog, apparatus: catalog.apparatus.map((item) => (item.id === id ? { ...item, name: name.trim(), builtin: null } : item)) });
}

/** Archived apparatus leave the pickers; past workouts keep showing them. */
export async function setApparatusArchived(id: string, archived: boolean): Promise<void> {
  const catalog = await getEquipment();
  await writeEquipment({ ...catalog, apparatus: catalog.apparatus.map((item) => (item.id === id ? { ...item, archived } : item)) });
}

export async function saveBandSet(set: Omit<BandSet, 'id'> & { id?: string }): Promise<BandSet> {
  const catalog = await getEquipment();
  const next: BandSet = { id: set.id ?? newId(), name: set.name.trim(), archived: set.archived ?? false, bands: set.bands.map((band) => ({ ...band, name: band.name.trim() })) };
  const exists = catalog.bandSets.some((item) => item.id === next.id);
  await writeEquipment({
    ...catalog,
    bandSets: exists ? catalog.bandSets.map((item) => (item.id === next.id ? next : item)) : [...catalog.bandSets, next],
    bandOrder: orderAfterSetEdit(catalog.bandOrder, catalog.bandSets, next),
  });
  return next;
}

/** Saves the strength order of every band, lightest first, across band sets. */
export async function saveBandOrder(bandOrder: string[]): Promise<void> {
  const catalog = await getEquipment();
  await writeEquipment({ ...catalog, bandOrder });
}

export async function setBandSetArchived(id: string, archived: boolean): Promise<void> {
  const catalog = await getEquipment();
  await writeEquipment({ ...catalog, bandSets: catalog.bandSets.map((item) => (item.id === id ? { ...item, archived } : item)) });
}

export const newBand = (name: string, color: string): Band => ({ id: newId(), name, color, minKg: null, maxKg: null });
