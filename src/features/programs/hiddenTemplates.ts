import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';

// Built-in templates live in the app code, so "deleting" one only hides it; it can be restored.
const KEY = 'hidden_program_templates_v1';

export async function listHiddenTemplates(): Promise<string[]> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function setHiddenTemplates(ids: readonly string[]): Promise<void> {
  await initializeDatabase();
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    await db.delete(settings).where(eq(settings.key, KEY));
    return;
  }
  const value = JSON.stringify(unique);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
