import type { Experience, Hackathon } from "../../content/types";

/** A run of an experience's period text, tagged with the ISO date it shows, if any. */
export interface PeriodPart {
  text: string;
  dateTime?: string;
}

/**
 * Splits an experience's display `period` into its start and end, so each can sit in a
 * `<time>` with its ISO date. The text is only split, never reworded: joined back together the
 * parts are exactly `period`. "Aug 2026 – Present" has no `end`, so "Present" stays plain text.
 * A period that doesn't split into two around a dash is one `<time>` for `start`.
 */
export function periodParts({ period, start, end }: Experience): PeriodPart[] {
  const match = /^(.+?)(\s+[–—-]\s+)(.+)$/.exec(period);
  if (!match) return [{ text: period, dateTime: start }];
  const [, from, dash, to] = match as unknown as [string, string, string, string];
  return [
    { text: from, dateTime: start },
    { text: dash },
    end ? { text: to, dateTime: end } : { text: to },
  ];
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * A hackathon's ISO date as a strip label: "2026-05-30" or "2026-05" → "MAY 2026". Undefined
 * when the date is absent or malformed, so the card shows nothing rather than a broken label.
 */
export function eventDateLabel(date: Hackathon["date"]): string | undefined {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(date ?? "");
  const month = match && MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : undefined;
}

/**
 * Newest first by `date`; undated events last, in content order. ISO dates sort correctly as
 * text, so a month-only date ("2026-05") comes after every full date in that month.
 */
export function newestFirst(list: readonly Hackathon[]): Hackathon[] {
  const dated = list.filter((h) => h.date).sort((a, b) => b.date!.localeCompare(a.date!));
  return [...dated, ...list.filter((h) => !h.date)];
}
