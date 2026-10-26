import { describe, expect, it } from "vitest";
import { experience } from "../../content/experience";
import { hackathons } from "../../content/hackathons";
import type { Hackathon } from "../../content/types";
import { eventDateLabel, newestFirst, periodParts } from "./dates";

describe("periodParts", () => {
  it.each(experience.map((g) => [g.slug, g] as const))(
    "%s: splits the period without rewording it",
    (_, g) => {
      expect(
        periodParts(g)
          .map((p) => p.text)
          .join(""),
      ).toBe(g.period);
    },
  );

  it("tags the start with `start` and the end with `end`; an ongoing end stays plain text", () => {
    const base = { slug: "s", organization: "O", role: "R", projects: [] };
    expect(
      periodParts({ ...base, period: "May – Aug 2026", start: "2026-05", end: "2026-08" }),
    ).toEqual([
      { text: "May", dateTime: "2026-05" },
      { text: " – " },
      { text: "Aug 2026", dateTime: "2026-08" },
    ]);
    expect(periodParts({ ...base, period: "Aug 2026 – Present", start: "2026-08" })).toEqual([
      { text: "Aug 2026", dateTime: "2026-08" },
      { text: " – " },
      { text: "Present" },
    ]);
    expect(periodParts({ ...base, period: "Summer 2023", start: "2023-06" })).toEqual([
      { text: "Summer 2023", dateTime: "2023-06" },
    ]);
  });
});

describe("eventDateLabel", () => {
  it("formats full and month-only ISO dates, and gives nothing for missing or bad ones", () => {
    expect(eventDateLabel("2026-05-30")).toBe("MAY 2026");
    expect(eventDateLabel("2025-12")).toBe("DEC 2025");
    expect(eventDateLabel(undefined)).toBeUndefined();
    expect(eventDateLabel("2026-13-01")).toBeUndefined();
    expect(eventDateLabel("May 2026")).toBeUndefined();
  });
});

describe("newestFirst", () => {
  it("orders hackathons by date, newest first, undated last in content order", () => {
    const h = (slug: string, date?: string) => ({ ...hackathons[0]!, slug, date }) as Hackathon;
    const list = [h("a", "2025-01-02"), h("u1"), h("b", "2026-03"), h("u2"), h("c", "2026-03-04")];
    expect(newestFirst(list).map((x) => x.slug)).toEqual(["c", "b", "a", "u1", "u2"]);
  });
});
