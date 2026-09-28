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
