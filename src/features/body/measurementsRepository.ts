import { desc, like } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bodyMeasurements } from '../../db/schema';

export const namedMeasurementOptions = [
  { id: 'waist', unit: 'cm' },
  { id: 'hips', unit: 'cm' },
  { id: 'chest', unit: 'cm' },
  { id: 'upper_arm', unit: 'cm' },
  { id: 'thigh', unit: 'cm' },
  { id: 'calf', unit: 'cm' },
] as const;

export const mobilityTestOptions = [
  { id: 'pike', unit: 'cm', sideAware: false },
  { id: 'pancake', unit: 'cm', sideAware: false },
  { id: 'bridge', unit: 'deg', sideAware: false },
  { id: 'shoulder_flexion', unit: 'deg', sideAware: true },
  { id: 'splits', unit: 'cm', sideAware: true },
] as const;

export type NamedMeasurementId = (typeof namedMeasurementOptions)[number]['id'];
export type MobilityTestId = (typeof mobilityTestOptions)[number]['id'];
export type MeasurementSide = 'left' | 'right' | 'both';
export type MeasurementRow = typeof bodyMeasurements.$inferSelect;

const namedKind = (id: NamedMeasurementId) => `measurement:${id}`;
const mobilityKind = (id: MobilityTestId, side: MeasurementSide) => `mobility:${id}:${side}`;

function validateValue(value: number, unit: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`Value must be between ${min} and ${max} ${unit}`);
  }
}

export async function recordNamedMeasurement(
  id: NamedMeasurementId,
  value: number,
  unit: 'cm' | 'in' = 'cm',
  measuredAt = new Date(),
): Promise<void> {
  if (!namedMeasurementOptions.some((option) => option.id === id)) throw new RangeError('Unknown measurement');
  validateValue(value, unit, 1, unit === 'cm' ? 300 : 120);
  await initializeDatabase();
  await db.insert(bodyMeasurements).values({
    id: Crypto.randomUUID(), kind: namedKind(id), value, unit, measuredAt,
  });
}

export async function listNamedMeasurements(limit = 200): Promise<MeasurementRow[]> {
  await initializeDatabase();
  return db.select().from(bodyMeasurements)
    .where(like(bodyMeasurements.kind, 'measurement:%'))
    .orderBy(desc(bodyMeasurements.measuredAt)).limit(limit);
}

export async function recordMobilityTest(
  id: MobilityTestId,
  value: number,
  side: MeasurementSide = 'both',
  measuredAt = new Date(),
): Promise<void> {
  const option = mobilityTestOptions.find((entry) => entry.id === id);
  if (!option) throw new RangeError('Unknown mobility test');
  if (!option.sideAware && side !== 'both') throw new RangeError('This test has no side');
  if (id === 'splits' || id === 'pike') validateValue(value, 'cm', 0, 250);
  else if (id === 'pancake') validateValue(value, 'cm', 0, 250);
  else validateValue(value, 'deg', 0, 180);
  await initializeDatabase();
  await db.insert(bodyMeasurements).values({
    id: Crypto.randomUUID(), kind: mobilityKind(id, side), value, unit: option.unit, measuredAt,
  });
}

export async function listMobilityTests(limit = 300): Promise<MeasurementRow[]> {
  await initializeDatabase();
  return db.select().from(bodyMeasurements)
    .where(like(bodyMeasurements.kind, 'mobility:%'))
    .orderBy(desc(bodyMeasurements.measuredAt)).limit(limit);
}
