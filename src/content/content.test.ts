import { describe, expect, it } from "vitest";
import { hackathons } from "./hackathons";
import { projects } from "./projects";
import { resume } from "./resume";
import { socials } from "./site";
import type { Image, Link } from "./types";

const allLinks: Link[] = [
  ...projects.flatMap((p) => p.links),
  ...hackathons.flatMap((h) => h.links),
  ...socials,
];
const allImages: Image[] = [
  ...projects.flatMap((p) => p.images),
  ...hackathons.flatMap((h) => (h.image ? [h.image] : [])),
];

describe("content", () => {
  it.each([
    ["projects", projects.map((p) => p.slug)],
    ["hackathons", hackathons.map((h) => h.slug)],
  ])("%s have unique, URL-safe slugs", (_, slugs) => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("links are https or mailto", () => {
    for (const link of allLinks) expect(link.href).toMatch(/^(https:\/\/|mailto:)/);
  });

  it("every image has alt text", () => {
    for (const img of allImages) expect(img.alt.trim()).not.toBe("");
  });

  it("each skill group has its own glyph", () => {
    const glyphs = resume.skills.map((g) => g.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("hackathon dates are ISO when present", () => {
    for (const h of hackathons) {
      if (h.date) expect(h.date).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
    }
  });
});
