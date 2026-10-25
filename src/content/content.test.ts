/// <reference types="node" />
// Vitest runs in Node with the repo root as its working directory.
import { createHash } from "node:crypto";
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

// Teammates and the client's contacts are never named in public copy. The names live in a private,
// gitignored list (private/name-denylist.txt). CI doesn't have that file, so the repo also keeps
// SHA-256 hashes of the normalized names: the guard runs everywhere without publishing a name.
// Hashes can confirm a guessed name, so this is a safety net, not secrecy.
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const DENYLIST_HASHES: ReadonlySet<string> = new Set([
  "130847160a3f704668155bb0265d6512a62795b656755d8b766e6105023953d9",
  "1bad03de8a0713b7461c61308ba572db2f09e64a3e51cf9d6a7ee2bd8a0dfd31",
  "1e2b20cc9733ebbef2f9bf7ee7f60d2a332f18c221d51166292ced9c69efe0d9",
  "3c8c855f48efb9783b6895c805856a50fa507e42d538f0ae0c96a3946988081b",
  "4a0aca3ff0320c68358114de3854fe1400366813220225ef550d79e8e545e06f",
  "674159a9694357ed2d4bdbb31e9f9a8455a0c073290635036023200bb6c1294f",
  "693a71fd27f72abbd0f497702defa4a4a8d5fd8ef66fecae1eac319aaa70e1d1",
  "6c3cf0a3fff52494671581ab61c25ec5715e21a0251418acd172767eed50cbf0",
  "84b04cfea82eea313ded3ea7a268d79e136a27e76850a1cf76722dc146248a4a",
  "8d1820440dcff143414f505af00f2699f61828c5530eefd42fe3ea30c6207d72",
  "a3da73976501812cd7b821a20bfb09af0a6a891e419cdfb761fb19a92c914242",
  "a91506689d5d7f70006789cd13ce44f57fc6b1ed08bec5f3bedc0a93bd1ee1f9",
  "aebf2631b304570d913603cbe4ec35e092e6f13ff46cd8025a9e925c24f60bc4",
  "b2d35525e0cec4244fe6c1471a5a1f5e67f73b3860a638ab6cb9a2cd5de158ce",
  "b5d61560c0866422a4f1300fd657650d13d861c3d52024de60e408fff0f600f5",
  "ccd86c5ec7b5d0903add77937ac731338ac639418a69b8a2965ee096d4e73cb8",
  "e127a179f0276d568a41255b08cc33cba7da7be855c308e2e8288f76dff57c80",
  "ea9a838554c3b7c4d3311ad588cc6a1cdb2a1d1df2d569cc1ee0ac850c627db7",
]);

/** Hashes of every one- and two-word run in `text` that is on the denylist (entries are 1 or 2 words). */
function denylistedRuns(text: string, hashes: ReadonlySet<string>): string[] {
  const words = normalize(text).split(" ");
  const runs = words.flatMap((word, i) =>
    i + 1 < words.length ? [word, `${word} ${words[i + 1]}`] : [word],
  );
  return [...new Set(runs.map(sha256).filter((hash) => hashes.has(hash)))];
}

describe("people stay out of public copy", () => {
  const file = "private/name-denylist.txt";
  const names = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n && !n.startsWith("#"))
    : [];

  it("no content file mentions anyone on the hashed denylist (runs in CI)", () => {
    const found = denylistedRuns(
      JSON.stringify({ projects, hackathons, resume, site }),
      DENYLIST_HASHES,
    );
    expect(found.map((hash) => hash.slice(0, 8))).toEqual([]);
  });

  it("the hashed check flags a denylisted name and leaves other text alone", () => {
    const hashes = new Set([sha256("ada lovelace")]);
    expect(denylistedRuns("Built with Ada Lovelace's team.", hashes)).toEqual([
      sha256("ada lovelace"),
    ]);
    expect(denylistedRuns("Built with a team of four.", hashes)).toEqual([]);
  });

  it.skipIf(names.length === 0)("the committed hashes cover the private denylist", () => {
    for (const name of names)
      expect(
        DENYLIST_HASHES.has(sha256(normalize(name))),
        "hash missing for a denylist entry",
      ).toBe(true);
  });

  it.skipIf(names.length === 0)("no content file mentions anyone on the private denylist", () => {
    const everything = JSON.stringify({ projects, hackathons, resume, site }).toLowerCase();
    for (const name of names) expect(everything, name).not.toContain(name.toLowerCase());
  });
});
