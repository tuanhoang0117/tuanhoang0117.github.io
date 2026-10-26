import type { Hackathon } from "../../content/types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Newest first by `date`. Undated events go last, in data order. ISO strings sort correctly as
 * text, and a month-only date ("2026-05") sorts before any day in that month.
 */
export function sortHackathons(list: readonly Hackathon[]): Hackathon[] {
  const dated = list.filter((h) => h.date);
  const undated = list.filter((h) => !h.date);
  dated.sort((a, b) => (a.date! < b.date! ? 1 : a.date! > b.date! ? -1 : 0));
  return [...dated, ...undated];
}

/** "2026-05-30" or "2026-05" → "MAY 2026". Undefined when the date is missing or malformed. */
export function formatDateLabel(date: string | undefined): string | undefined {
  const match = date?.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return undefined;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : undefined;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const known = (n: number | undefined): n is number =>
  n !== undefined && Number.isFinite(n) && n > 0;

/**
 * "team of 4 · 24 hours · 300 participants", built only from stats that are known. Absent and
 * zero stats are both treated as unknown. Undefined when nothing is known.
 */
export function statsLine(stats: Hackathon["stats"]): string | undefined {
  if (!stats) return undefined;
  const parts: string[] = [];
  if (known(stats.teamSize)) parts.push(`team of ${stats.teamSize}`);
  if (known(stats.hours)) parts.push(count(stats.hours, "hour", "hours"));
  if (known(stats.participants)) {
    parts.push(count(stats.participants, "participant", "participants"));
  }
  return parts.length ? parts.join(" · ") : undefined;
}

/** Bottom strip label: position 0 + "ACE" → "01 ACE". */
export function stripLabel(index: number, project: string): string {
  return `${String(index + 1).padStart(2, "0")} ${project.toUpperCase()}`;
}
