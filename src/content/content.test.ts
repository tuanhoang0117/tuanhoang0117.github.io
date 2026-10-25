/// <reference types="node" />
// Vitest runs in Node with the repo root as its working directory.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hackathons } from "./hackathons";
import { projects } from "./projects";
import { resume } from "./resume";
import { site, socials } from "./site";
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

describe("case studies", () => {
  const withCaseStudy = projects.filter((p) => p.caseStudy);

  it("only one project is featured", () => {
    expect(projects.filter((p) => p.featured)).toHaveLength(1);
  });

  it.each(withCaseStudy.map((p) => [p.slug, p] as const))(
    "%s has every section filled in",
    (_, p) => {
      const c = p.caseStudy!;
      expect(c.overview.trim()).not.toBe("");
      expect(c.problem.trim()).not.toBe("");
      for (const list of [c.process, c.role, c.results, c.tools])
        expect(list.length).toBeGreaterThan(0);
      for (const step of c.process) {
        expect(step.title.trim()).not.toBe("");
        expect(step.detail.trim()).not.toBe("");
      }
      for (const line of [...c.role, ...c.results]) expect(line.trim()).not.toBe("");
    },
  );

  it.each(
    withCaseStudy.flatMap((p) => (p.caseStudy!.pdf ? [[p.slug, p.caseStudy!.pdf] as const] : [])),
  )("%s's PDF is a root-relative path to a file that exists in public/", (_, pdf) => {
    expect(pdf.href).toMatch(/^\/[a-z0-9-]+\.pdf$/);
    expect(existsSync(`public${pdf.href}`)).toBe(true);
  });

  it("no content claims Mailchimp work (Tuan didn't do it)", () => {
    expect(JSON.stringify({ projects, hackathons, resume, site })).not.toMatch(/mailchimp/i);
  });

  it("the Develop for Good project doesn't claim donation-flow work (Tuan didn't do it)", () => {
    const dfg = projects.find((p) => p.slug === "tar-syndrome-website")!;
    expect(JSON.stringify(dfg)).not.toMatch(/donat/i);
  });
});

describe("people stay out of public copy", () => {
  // Teammates and the client's contacts are never named. The names live in a private, gitignored
  // list, so CI (which doesn't have it) skips this; it runs on any machine that does.
  const file = "private/name-denylist.txt";
  const names = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n && !n.startsWith("#"))
    : [];

  it.skipIf(names.length === 0)("no content file mentions anyone on the private denylist", () => {
    const everything = JSON.stringify({ projects, hackathons, resume, site }).toLowerCase();
    for (const name of names) expect(everything, name).not.toContain(name.toLowerCase());
  });
});
