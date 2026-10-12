/** The first coaching cue of an exercise (stored as a JSON list), or null. */
export function firstCue(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null;
  } catch {
    return null;
  }
}
