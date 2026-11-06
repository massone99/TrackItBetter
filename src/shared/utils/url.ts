/** Exercises of the StretchStrong library app open by id: `stretchstrong://exercise/<id>`, ids look like `recPWK5BgJUjfrsNO`. */
const STRETCHSTRONG_PREFIX = 'stretchstrong://exercise/';
const STRETCHSTRONG_ID = /^[A-Za-z0-9]{6,40}$/;

/** The exercise id inside a StretchStrong link, else null. */
export function stretchStrongId(url: string): string | null {
  if (!url.startsWith(STRETCHSTRONG_PREFIX)) return null;
  const id = url.slice(STRETCHSTRONG_PREFIX.length);
  return STRETCHSTRONG_ID.test(id) ? id : null;
}

/**
 * Normalizes a user-typed video link. Adds https:// when the scheme is missing and accepts only
 * http(s) links with a real host, plus a StretchStrong exercise link (or just its id, `rec…`). Returns null for empty input and
 * undefined when it is invalid.
 */
export function normalizeVideoUrl(input: string): string | null | undefined {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (stretchStrongId(trimmed)) return trimmed;
  if (/^rec[A-Za-z0-9]{6,37}$/.test(trimmed)) return `${STRETCHSTRONG_PREFIX}${trimmed}`;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!url.hostname.includes('.') || /\s/.test(trimmed)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Short label for a link, e.g. "youtube.com". */
export function linkHost(url: string): string {
  if (stretchStrongId(url)) return 'StretchStrong';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
