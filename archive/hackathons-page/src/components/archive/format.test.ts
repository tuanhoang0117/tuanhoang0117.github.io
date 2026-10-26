import { describe, expect, it } from "vitest";
import type { Hackathon } from "../../content/types";
import { formatDateLabel, sortHackathons, statsLine, stripLabel } from "./format";

const event = (slug: string, date?: string): Hackathon => ({
  slug,
  project: slug,
  event: `${slug} event`,
  date,
  summary: "s",
  role: "r",
  stack: [],
  links: [],
  tint: "sky",
});

describe("sortHackathons", () => {
  it("puts the newest first and undated events last, in data order", () => {
    const list = [
      event("undated-a"),
      event("old", "2024-10-05"),
      event("new", "2026-05-30"),
      event("undated-b"),
      event("mid-month-only", "2025-03"),
      event("undated-c"),
      event("mid", "2025-03-21"),
    ];
    expect(sortHackathons(list).map((h) => h.slug)).toEqual([
      "new",
      "mid",
      "mid-month-only",
      "old",
      "undated-a",
      "undated-b",
      "undated-c",
    ]);
  });

  it("doesn't reorder the input array", () => {
    const list = [event("old", "2024-01-01"), event("new", "2026-01-01")];
    sortHackathons(list);
    expect(list.map((h) => h.slug)).toEqual(["old", "new"]);
  });
});

describe("formatDateLabel", () => {
  it.each([
    ["2026-05-30", "MAY 2026"],
    ["2026-05", "MAY 2026"],
    ["2025-12-04", "DEC 2025"],
    ["2026-01-01", "JAN 2026"],
  ])("%s → %s", (input, label) => {
    expect(formatDateLabel(input)).toBe(label);
  });

  it.each([[undefined], [""], ["2026"], ["2026-13-01"], ["2026-00"], ["May 2026"]])(
    "omits the label for %j",
    (input) => {
      expect(formatDateLabel(input)).toBeUndefined();
    },
  );
});

describe("statsLine", () => {
  it("joins every known stat", () => {
    expect(statsLine({ teamSize: 4, hours: 24, participants: 300 })).toBe(
      "team of 4 · 24 hours · 300 participants",
    );
  });

  it("uses only the stats that exist", () => {
    expect(statsLine({ hours: 36 })).toBe("36 hours");
    expect(statsLine({ teamSize: 3, participants: 120 })).toBe("team of 3 · 120 participants");
  });

  it("uses singular units for one", () => {
    expect(statsLine({ hours: 1, participants: 1 })).toBe("1 hour · 1 participant");
  });

  it("treats zero as unknown, never showing 0", () => {
    expect(statsLine({ teamSize: 0, hours: 24, participants: 0 })).toBe("24 hours");
  });

  it.each([
    ["no stats object", undefined],
    ["an empty stats object", {}],
    ["only zeros", { teamSize: 0, hours: 0, participants: 0 }],
  ])("is undefined for %s", (_, stats) => {
    expect(statsLine(stats)).toBeUndefined();
  });
});

describe("stripLabel", () => {
  it("numbers from 01 and uppercases the project", () => {
    expect(stripLabel(0, "Ace")).toBe("01 ACE");
    expect(stripLabel(11, "oculusMD")).toBe("12 OCULUSMD");
  });
});
