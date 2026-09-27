import { desc, eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bodyMeasurements } from '../../db/schema';

export async function listBodyweights(limit = 60) {
  await initializeDatabase();
  return db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.kind, 'weight'))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(limit);
}

export async function recordBodyweight(value: number, unit: 'kg' | 'lb'): Promise<void> {
  if (!Number.isFinite(value) || value < 20 || value > 400) {
    throw new RangeError('Enter a bodyweight between 20 and 400');
  }
  await initializeDatabase();
  await db.insert(bodyMeasurements).values({
    id: Crypto.randomUUID(),
    kind: 'weight',
    value,
    unit,
    measuredAt: new Date(),
  });
}
