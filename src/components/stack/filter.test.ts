import { describe, expect, it } from "vitest";
import { resume } from "../../content/resume";
import type { SkillGroup } from "../../content/types";
import { ALL, groupSlug, parseFilter, stackCards, visibleCards } from "./filter";
import { glyphs } from "./glyphs";

const groups: SkillGroup[] = [
  { label: "Languages", glyph: "square", skills: ["A", "B"] },
  { label: "Backend & Data", glyph: "circle", skills: ["C"] },
  { label: "Frontend", glyph: "triangle", skills: ["D", "E", "F"] },
];

describe("glyphs", () => {
  it("maps each shape to the character and color token the design system names", () => {
    expect(glyphs).toEqual({
      square: { char: "■", color: "text-glyph-blue" },
      circle: { char: "●", color: "text-glyph-red" },
      diamond: { char: "◆", color: "text-glyph-purple" },
      triangle: { char: "▲", color: "text-glyph-orange" },
      plus: { char: "✚", color: "text-poly-bright" },
    });
  });
});

describe("groupSlug", () => {
  it("turns labels into URL-safe ids", () => {
    expect(groupSlug("Frontend")).toBe("frontend");
    expect(groupSlug("Backend & Data")).toBe("backend-data");
    expect(groupSlug("Testing & DevOps")).toBe("testing-devops");
  });

  it("gives every real skill group a unique slug that isn't the All filter", () => {
    const slugs = resume.skills.map((g) => groupSlug(g.label));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain(ALL);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("stackCards", () => {
  it("makes one card per skill, numbered through the whole deck", () => {
    const cards = stackCards(groups);
    expect(cards.map((c) => [c.name, c.slug, c.number])).toEqual([
      ["A", "languages", "#01"],
      ["B", "languages", "#02"],
      ["C", "backend-data", "#03"],
      ["D", "frontend", "#04"],
      ["E", "frontend", "#05"],
      ["F", "frontend", "#06"],
    ]);
  });

  it("covers every skill in resume.ts", () => {
    expect(stackCards(resume.skills)).toHaveLength(
      resume.skills.reduce((n, g) => n + g.skills.length, 0),
    );
  });
});

describe("parseFilter", () => {
  it("accepts a known group slug", () => {
    expect(parseFilter("frontend", groups)).toBe("frontend");
    expect(parseFilter("backend-data", groups)).toBe("backend-data");
  });

  it("falls back to All when the value is missing or unknown", () => {
    expect(parseFilter(null, groups)).toBe(ALL);
    expect(parseFilter("", groups)).toBe(ALL);
    expect(parseFilter("cobol", groups)).toBe(ALL);
    expect(parseFilter("Frontend", groups)).toBe(ALL);
  });
});

describe("visibleCards", () => {
  const cards = stackCards(groups);

  it("shows everything for All", () => {
    expect(visibleCards(cards, ALL)).toEqual(cards);
  });

  it("shows only the chosen group, keeping deck numbers", () => {
    expect(visibleCards(cards, "frontend").map((c) => [c.name, c.number])).toEqual([
      ["D", "#04"],
      ["E", "#05"],
      ["F", "#06"],
    ]);
  });
});
