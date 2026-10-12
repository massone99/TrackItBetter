import type { PersonalBest } from "../../features/analytics/summary";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${formatNumber(seconds)}s`;
}

/** Clock-style duration for timers, e.g. 1:05. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** Time totals, e.g. "45 s", "1 min 30 s", "12 min" or "1 h 05 min" (seconds only under 10 minutes). */
export function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total === 0) return "0 min";
  if (total < 60) return `${total} s`;
  if (total < 600) {
    const rest = total % 60;
    return rest === 0 ? `${total / 60} min` : `${Math.floor(total / 60)} min ${rest} s`;
  }
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/**
 * Reads a number typed by hand: accepts a decimal comma and, with `clock`, "m:ss" (1:30 → 90).
 * Returns null for anything that is not a finite number.
 */
/**
 * Keeps only what a number field accepts as it is typed: digits (and ':' for a duration), one decimal
 * separator unless `integer`, and a leading minus when `allowNegative`. Letters and anything pasted
 * that is not part of a number are dropped.
 */
export function sanitizeNumberInput(text: string, options: { clock?: boolean; integer?: boolean; allowNegative?: boolean } = {}): string {
  if (options.clock) return text.replace(/[^\d:]/g, "");
  const negative = options.allowNegative && text.trimStart().startsWith("-");
  let body = text.replace(options.integer ? /\D/g : /[^\d.,]/g, "");
  if (!options.integer) {
    const separator = body.search(/[.,]/);
    if (separator >= 0) body = body.slice(0, separator + 1) + body.slice(separator + 1).replace(/[.,]/g, "");
  }
  return (negative ? "-" : "") + body;
}

export function parseNumberInput(text: string, clock = false): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (clock && trimmed.includes(":")) {
    const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  // Durations are typed on the number pad like a kitchen timer: up to two digits are seconds, longer
  // entries end with two digits of seconds ("130" is 1:30, "1000" is 10:00).
  if (clock) {
    if (!/^\d+$/.test(trimmed)) return null;
    if (trimmed.length <= 2) return Number(trimmed);
    const seconds = Number(trimmed.slice(-2));
    return seconds > 59 ? null : Number(trimmed.slice(0, -2)) * 60 + seconds;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function formatBestValue(best: Pick<PersonalBest, "kind" | "value">): string {
  if (best.kind === "reps") return `${formatNumber(best.value)} reps`;
  if (best.kind === "hold") return formatDuration(best.value);
  if (best.kind === "distance") return `${formatNumber(best.value)} m`;
  return `${formatNumber(best.value)} kg`;
}
