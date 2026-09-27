/**
 * Normalizes a user-typed video link. Adds https:// when the scheme is missing and accepts only
 * http(s) links with a real host. Returns null for empty input and undefined when it is invalid.
 */
export function normalizeVideoUrl(input: string): string | null | undefined {
  const trimmed = input.trim();
  if (!trimmed) return null;
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
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
