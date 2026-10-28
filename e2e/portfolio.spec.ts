import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { experience, projectsOutsideExperience } from "../src/content/experience";
import { hackathons } from "../src/content/hackathons";
import { portfolioSections } from "../src/content/portfolio";
import { projects } from "../src/content/projects";
import { checkContrast } from "./helpers/checkContrast";

const SECTIONS = ["experience", "hackathons", "projects"] as const;
type SectionId = (typeof SECTIONS)[number];

const featured = projects.find((p) => p.featured)!;
const outside = projectsOutsideExperience(projects, experience);
const newestExperience = [...experience].sort((a, b) => b.start.localeCompare(a.start));
// Every card on the page: projects under experiences, hackathons, the remaining projects.
const CARD_COUNT =
  experience.reduce((n, g) => n + g.projects.length, 0) + hackathons.length + outside.length;

const section = (page: Page, id: SectionId) => page.getByTestId(`section-${id}`);
const cards = (page: Page) => page.getByRole("main").getByRole("article");
const nodes = (page: Page) => section(page, "experience").getByTestId("experience");
const featuredCard = (page: Page) => page.getByTestId("featured-project");

/**
 * Waits until the card entrances have finished, so layout is measured where the cards rest, not
 * mid-rise. Ignores endless loops (the banner scrolls forever).
 */
async function settleEntrances(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
        ),
      { timeout: 3000 },
    )
    .toBe(0);
}

interface Entrance {
  /** The section the animated element is in. */
  section: string;
  /** Which `<Stagger>` list on the page (0-based, document order) it is a direct child of. */
  list: number;
  /** Its position in that list. */
  index: number;
  delay: number;
}

/** Records every Web Animations call on the page as it is made. */
async function recordEntrances(page: Page) {
  await page.addInitScript(() => {
    const log: Entrance[] = [];
    (window as unknown as { entranceLog: Entrance[] }).entranceLog = log;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const timing = typeof options === "object" ? options : {};
      // Endless loops (the page title's shimmer) aren't entrances.
      if (timing.iterations === Infinity) return original.call(this, keyframes, options);
      const parent = this.parentElement;
      log.push({
        section: this.closest("section")?.dataset.testid ?? this.tagName,
        list: [...document.querySelectorAll("[data-stagger]")].indexOf(parent!),
        index: parent ? [...parent.children].indexOf(this) : -1,
        delay: Number(timing.delay ?? 0),
      });
      return original.call(this, keyframes, options);
    };
  });
}

const entranceLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { entranceLog: Entrance[] }).entranceLog);

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

type Box = { left: number; right: number; top: number; bottom: number };

/** Each element's box, rounded to whole pixels. */
function boxes(locator: Locator): Promise<Box[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    }),
  );
}

/**
 * The tallest empty horizontal band inside each card: the largest vertical stretch, between the
 * card's top and bottom edges, where no text, image, or filled area is drawn in any column.
 * Padding and gaps between parts count as empty, so a card with no stretch measures ~50px at
 * most; a card stretched to a taller neighbour (links pushed to the bottom, or blank space below
 * them) measures far more.
 */
function emptyBands(page: Page) {
  return cards(page).evaluateAll((els) =>
    els.map((card) => {
      const box = card.getBoundingClientRect();
      const spans: [number, number][] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim() || n.parentElement?.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) spans.push([r.top, r.bottom]);
      }
      // Images, and filled areas (the strip, tags, the featured card's wash panel), are drawn
      // content too; a white button on the white card is not, but its label is.
      const surface = getComputedStyle(card).backgroundColor;
      for (const el of card.querySelectorAll("*")) {
        const bg = getComputedStyle(el).backgroundColor;
        if (el.tagName === "IMG" || (bg !== surface && bg !== "rgba(0, 0, 0, 0)")) {
          const r = el.getBoundingClientRect();
          if (r.height > 1) spans.push([r.top, r.bottom]);
        }
      }
      spans.sort((a, b) => a[0] - b[0]);
      let covered = box.top;
      let gap = 0;
      for (const [top, bottom] of spans) {
        gap = Math.max(gap, top - covered);
        covered = Math.max(covered, bottom);
      }
      gap = Math.max(gap, box.bottom - covered);
      const name = card.querySelector("h3, h4")?.textContent ?? "?";
      return { name, gap: Math.round(gap), height: Math.round(box.height) };
    }),
  );
}

test.describe("/portfolio", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/portfolio");
  });

  test("has three sections in order, with headings and prompts from content", async ({ page }) => {
    const headings = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(headings).toHaveCount(3);
    for (const [i, id] of SECTIONS.entries()) {
      const { heading, prompt } = portfolioSections[id];
      await expect(headings.nth(i)).toContainText(heading);
      await expect(section(page, id)).toHaveAccessibleName(new RegExp(`${heading}$`));
      await expect(section(page, id).locator(".prompt")).toHaveText(prompt);
    }
  });

  test("every card is fully visible after load, with no scrolling and nothing left hidden", async ({
    page,
  }) => {
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    await settleEntrances(page);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    // Cards and timeline nodes below the fold too: nothing waits for a scroll position (ADR 0002).
    for (const el of [...(await cards(page).all()), ...(await nodes(page).all())]) {
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS("opacity", "1");
      await expect(el).toHaveCSS("clip-path", "none");
      await expect(el).toHaveCSS("transform", "none");
      // Tailwind's translate-* utilities set `translate`, not `transform`.
      await expect(el).toHaveCSS("translate", "none");
      await expect(el).not.toContainText(/undefined|NaN/);
    }
  });

  test("no ancestor of the page content creates a containing block for fixed elements", async ({
    page,
  }) => {
    await settleEntrances(page);
    const offenders = await page.locator("main section").evaluateAll((sections) => {
      const found: string[] = [];
      for (const s of sections) {
        for (let n: Element | null = s; n; n = n.parentElement) {
          const st = getComputedStyle(n);
          for (const prop of [
            "transform",
            "translate",
            "rotate",
            "scale",
            "filter",
            "perspective",
          ]) {
            const v = st.getPropertyValue(prop);
            if (v && v !== "none") found.push(`${n.tagName}.${n.className}: ${prop} ${v}`);
          }
          if (st.willChange.includes("transform")) found.push(`${n.tagName}: will-change`);
          if (/paint|strict|content/.test(st.contain)) found.push(`${n.tagName}: contain`);
        }
      }
      return [...new Set(found)];
    });
    expect(offenders).toEqual([]);
  });

  test.describe("Experience", () => {
    test("is a real ordered list of experiences, newest first, with <time> dates", async ({
      page,
    }) => {
      const list = section(page, "experience").locator("ol");
      await expect(list).toHaveCount(1);
      await expect(list.locator("> li")).toHaveCount(experience.length);
      for (const [i, g] of newestExperience.entries()) {
        const node = nodes(page).nth(i);
        await expect(node.getByRole("heading", { level: 3 })).toContainText(g.organization);
        await expect(node).toContainText(g.role);
        await expect(node.getByTestId("experience-period")).toHaveText(g.period);
        await expect(node.locator("time").first()).toHaveAttribute("datetime", g.start);
        if (g.end) await expect(node.locator("time").nth(1)).toHaveAttribute("datetime", g.end);
      }
    });

    test("links each organization that has a link, in a new tab", async ({ page }) => {
      for (const g of experience) {
        const heading = section(page, "experience").getByRole("heading", {
          level: 3,
          name: new RegExp(`^${g.organization}`),
        });
        if (!g.link) {
          await expect(heading.getByRole("link")).toHaveCount(0);
          continue;
        }
        const link = heading.getByRole("link", {
          name: `${g.organization} (opens in a new tab)`,
        });
        await expect(link).toHaveAttribute("href", g.link.href);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noreferrer/);
      }
    });

    test("nests each experience's projects under it as cards", async ({ page }) => {
      for (const [i, g] of newestExperience.entries()) {
        const titles = g.projects.map((s) => projects.find((p) => p.slug === s)!.title);
        await expect(nodes(page).nth(i).getByRole("heading", { level: 4 })).toHaveText(titles);
      }
    });

    test("the featured TAR Syndrome card sits under Develop for Good", async ({ page }) => {
      expect(featured.slug).toBe("tar-syndrome-website");
      const dfg = nodes(page).filter({ hasText: "Develop for Good" });
      await expect(dfg.getByTestId("featured-project")).toHaveCount(1);
      await expect(featuredCard(page)).toHaveCount(1);
      await expect(featuredCard(page).getByRole("heading", { level: 4 })).toHaveText(
        featured.title,
      );
    });

    test("the featured card's case-study link opens the DFG case-study page", async ({ page }) => {
      const link = featuredCard(page).getByRole("link", { name: /^Case study/ });
      await expect(link).toHaveAttribute("href", "/portfolio/tar-syndrome-website");
      await link.click();
      await expect(page).toHaveURL("/portfolio/tar-syndrome-website");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(featured.title);
    });

    test("the featured card links to the live site in a new tab", async ({ page }) => {
      for (const l of featured.links) {
        const link = featuredCard(page).getByRole("link", { name: new RegExp(`^${l.label}`) });
        await expect(link).toHaveAttribute("href", l.href);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noreferrer/);
      }
      const live = featured.links.find((l) => /live site/i.test(l.label));
      expect(live?.href).toMatch(/^https:\/\//);
    });

    test("at 375px it is one column with the line down the left edge and a marker on it per node", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 740 });
      await settleEntrances(page);
      const ol = section(page, "experience").locator("ol");
      const line = await ol.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const width = parseFloat(getComputedStyle(el).borderLeftWidth);
        return { left: r.left, center: r.left + width / 2, width };
      });
      expect(line.width).toBeGreaterThan(0);
      expect(line.left, "the timeline line sits near the left edge").toBeLessThanOrEqual(32);
      const markers = await boxes(section(page, "experience").getByTestId("timeline-marker"));
      expect(markers).toHaveLength(experience.length);
      for (const m of markers) {
        expect(Math.abs((m.left + m.right) / 2 - line.center)).toBeLessThanOrEqual(1);
        expect(m.right - m.left, "markers are square").toBe(m.bottom - m.top);
      }
      const nested = await boxes(section(page, "experience").getByRole("article"));
      expect(new Set(nested.map((b) => b.left)).size, "one column").toBe(1);
      expect(nested[0]!.left).toBeGreaterThan(line.left + line.width);
      expect(await overflow(page)).toBe(0);
    });
  });

  test.describe("Hackathons", () => {
    test("shows every hackathon's summary, my part, stack and links", async ({ page }) => {
      const s = section(page, "hackathons");
      await expect(s.getByRole("article")).toHaveCount(hackathons.length);
      for (const h of hackathons) {
        const card = s.getByRole("article", { name: h.project });
        await expect(card).toContainText(h.event);
        await expect(card).toContainText(h.summary);
        await expect(card.getByTestId("my-part")).toContainText(h.role);
        await expect(card.getByTestId("stack-tag")).toHaveText(h.stack);
        for (const l of h.links) {
          const link = card.getByRole("link", { name: `${l.label} (opens in a new tab)` });
          await expect(link).toHaveAttribute("href", l.href);
          await expect(link).toHaveAttribute("target", "_blank");
        }
      }
    });
  });

  test.describe("Projects", () => {
    test("shows the projects not under any experience, with their links", async ({ page }) => {
      const s = section(page, "projects");
      await expect(s.getByRole("heading", { level: 3 })).toHaveText(outside.map((p) => p.title));
      for (const p of outside) {
        for (const l of p.links) {
          await expect(
            s
              .getByRole("article", { name: p.title })
              .getByRole("link", { name: new RegExp(`^${l.label}`) }),
          ).toHaveAttribute("href", l.href);
        }
      }
    });
  });

  test("cards carry accent block shadows that vary across the page, never plain ink", async ({
    page,
  }) => {
    await settleEntrances(page);
    // Tailwind stacks transparent ring layers before the block shadow; the block is the last
    // layer: "<color> 10px 10px 0px 0px", hard (no blur, no spread).
    const blockLayer = (s: string) => s.split(/, (?=(?:rgba?|oklab|oklch)\()/).at(-1)!;
    const shadows = (
      await cards(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow))
    ).map(blockLayer);
    // The same size with no accent color: the plain ink shadow a card must not have.
    const inkShadow = blockLayer(
      await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.className = "shadow-block-lg";
        document.body.append(probe);
        const shadow = getComputedStyle(probe).boxShadow;
        probe.remove();
        return shadow;
      }),
    );
    expect(inkShadow).toMatch(/ 10px 10px 0px 0px$/);
    expect(shadows).toHaveLength(CARD_COUNT);
    for (const s of shadows) {
      expect(s).toMatch(/ 10px 10px 0px 0px$/);
      expect(s).not.toBe(inkShadow);
    }
    // The Portfolio theme has four shadow colors; the page's cards cycle through all of them.
    expect(new Set(shadows).size).toBe(4);
    // Cards next to each other in reading order never share a color.
    for (let i = 1; i < shadows.length; i++) expect(shadows[i]).not.toBe(shadows[i - 1]);
  });

  test("each section's list enters on load, starting at delay 0, in reading order", async ({
    page,
  }) => {
    await recordEntrances(page);
    await page.goto("/portfolio");
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    const log = await entranceLog(page);
    const lists = await page.locator("main [data-stagger]").count();
    expect(lists, "one entrance list per section").toBe(SECTIONS.length);
    for (let list = 0; list < lists; list++) {
      const entries = log.filter((e) => e.list === list);
      expect(entries[0]?.section, `list ${list}`).toBe(`section-${SECTIONS[list]}`);
      const size = await page.locator("main [data-stagger]").nth(list).locator("> *").count();
      expect(
        entries.map((e) => e.index),
        `list ${list}: every item enters, in order`,
      ).toEqual([...Array(size).keys()]);
      expect(entries[0]!.delay, `list ${list} starts its own entrance at 0`).toBe(0);
      for (const [i, e] of entries.slice(1).entries()) {
        expect(e.delay - entries[i]!.delay).toBeGreaterThanOrEqual(40);
        expect(e.delay - entries[i]!.delay).toBeLessThanOrEqual(80);
      }
    }
    expect(
      log.filter((e) => e.list === -1),
      "nothing else enters on first load",
    ).toEqual([]);
  });

  test("under reduced motion, everything appears in place with no entrance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordEntrances(page);
    await page.goto("/portfolio");
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    expect(await entranceLog(page)).toEqual([]);
    for (const el of [...(await cards(page).all()), ...(await nodes(page).all())]) {
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS("transform", "none");
      await expect(el).toHaveCSS("translate", "none");
      await expect(el).toHaveCSS("clip-path", "none");
    }
  });

  test("has no serious accessibility violations, and text on graph paper passes contrast", async ({
    page,
  }) => {
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await settleEntrances(page);
    await checkContrast(page);
  });

  // 375px is the width docs/design-system.md promises; 800px is a tablet; 1280px is desktop.
  for (const { width, hackathonCols, projectCols } of [
    { width: 375, hackathonCols: 1, projectCols: 1 },
    { width: 800, hackathonCols: 2, projectCols: 2 },
    { width: 1280, hackathonCols: 2, projectCols: 3 },
  ]) {
    test.describe(`at ${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await expect(cards(page)).toHaveCount(CARD_COUNT);
        await settleEntrances(page);
      });

      test("lays the grids out in their columns, with no overflow", async ({ page }) => {
        for (const [id, cols] of [
          ["hackathons", hackathonCols],
          ["projects", projectCols],
        ] as const) {
          const lefts = (await boxes(section(page, id).getByRole("article"))).map((b) => b.left);
          expect(new Set(lefts).size, `${id} columns`).toBe(Math.min(cols, lefts.length));
        }
        expect(await overflow(page)).toBe(0);
      });

      test("every grid row reaches both edges of its grid: no part-empty rows", async ({
        page,
      }) => {
        const grids = [
          section(page, "hackathons").locator("[data-stagger]"),
          section(page, "projects").locator("[data-stagger]"),
          ...(await section(page, "experience").getByTestId("experience").all()).map((n) =>
            n.locator("div:has(> article)"),
          ),
        ];
        for (const grid of grids) {
          const [edges] = await boxes(grid);
          const rows = new Map<number, Box[]>();
          for (const b of await boxes(grid.locator("> article"))) {
            rows.set(b.top, [...(rows.get(b.top) ?? []), b]);
          }
          for (const [top, row] of rows) {
            const names = await grid.locator("> article h3, > article h4").allTextContents();
            const message =
              `Row at y=${top} of the grid holding ${names.join(", ")} spans ` +
              `${Math.min(...row.map((b) => b.left))}–${Math.max(...row.map((b) => b.right))}, ` +
              `but the grid spans ${edges!.left}–${edges!.right}. The number of cards no longer ` +
              `fills the rows at ${width}px; the layout needs to change with the content.`;
            expect(Math.min(...row.map((b) => b.left)), message).toBe(edges!.left);
            expect(Math.max(...row.map((b) => b.right)), message).toBe(edges!.right);
          }
        }
      });

      test("no card is stretched: none has a large empty area inside it", async ({ page }) => {
        const bands = await emptyBands(page);
        expect(bands).toHaveLength(CARD_COUNT);
        const stretched = bands.filter((b) => b.gap > 64);
        expect(stretched, "cards with an empty band taller than 64px").toEqual([]);
      });
    });
  }

  test("fills the width at 1280px: sections line up with the page title, no wide margins", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await settleEntrances(page);
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    for (const id of ["hackathons", "projects"] as const) {
      const [grid] = await boxes(section(page, id).locator("[data-stagger]"));
      expect(grid!.left, id).toBe(Math.round(title.x));
      expect(grid!.right - grid!.left, id).toBeGreaterThanOrEqual(1280 * 0.8);
    }
  });
});
