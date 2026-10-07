import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import type { Apparatus, Band } from '../../domain/equipment';
import { formatNumber } from '../../shared/utils/format';
import { getEquipment, type EquipmentCatalog } from './repository';

/** kg range of a band as shown in lists, e.g. "15–35 kg"; empty when unknown. */
export function bandRange(band: Pick<Band, 'minKg' | 'maxKg'>): string {
  const { minKg, maxKg } = band;
  if (minKg === null && maxKg === null) return '';
  if (minKg === null || maxKg === null || minKg === maxKg) return `${formatNumber((minKg ?? maxKg)!)} kg`;
  return `${formatNumber(minKg)}–${formatNumber(maxKg)} kg`;
}

/** Display name of an apparatus: the typed one, or the translated name of a built-in. */
export function apparatusName(apparatus: Apparatus | undefined, t: TFunction): string {
  if (!apparatus) return t('equipment.unknownApparatus');
  return apparatus.builtin ? t(`equipment.builtin.${apparatus.builtin}`) : apparatus.name;
}

/** Every band of every set, by id (archived sets included, so past sets still show their bands). */
export function bandsById(catalog: EquipmentCatalog): Map<string, Band & { setName: string }> {
  return new Map(catalog.bandSets.flatMap((set) => set.bands.map((band) => [band.id, { ...band, setName: set.name }] as const)));
}

/** The equipment catalog, read on mount; `reload` reads it again (e.g. when a screen regains focus). */
export function useEquipment(): { catalog: EquipmentCatalog | null; reload: () => Promise<void> } {
  const [catalog, setCatalog] = useState<EquipmentCatalog | null>(null);
  const reload = useCallback(async () => { setCatalog(await getEquipment()); }, []);
  useEffect(() => {
    let mounted = true;
    void getEquipment().then((value) => { if (mounted) setCatalog(value); });
    return () => { mounted = false; };
  }, []);
  return { catalog, reload };
}

/** Swatches and text for the bands of a set, e.g. "Blue · 2 + Green · 1 · 25 kg". */
export function describeSetBands(
  set: { bands: readonly { bandId: string; tension: number }[]; assistKg: number | null },
  byId: ReadonlyMap<string, Band>,
  t: TFunction,
): { colors: string[]; text: string } | null {
  if (set.bands.length === 0) return null;
  const parts = set.bands.map((item) => `${byId.get(item.bandId)?.name ?? t('bands.unknown')} · ${item.tension}`);
  const kg = set.assistKg === null ? null : t('bands.assistShort', { value: formatNumber(set.assistKg) });
  return { colors: set.bands.map((item) => byId.get(item.bandId)?.color ?? '#828282'), text: [parts.join(' + '), kg].filter(Boolean).join(' · ') };
}
