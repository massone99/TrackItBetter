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
export function parseNumberInput(text: string, clock = false): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (clock && trimmed.includes(":")) {
    const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
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
